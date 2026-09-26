import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertRlsEnforced } from "@/db/client";
import { courses, enrollments, pathCourses, paths } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

function pgCode(error: unknown): string | undefined {
  const cause = (error as { cause?: { code?: string } }).cause;
  return cause?.code ?? (error as { code?: string }).code;
}

describe.skipIf(!hasDatabase)("row-level security", () => {
  let dbs: TestDatabases;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    dbs = await openTestDatabases();
    tenantA = await createTenant(dbs.owner.db, {
      courses: [{ slug: "course-a", delivery_mode: "free_async" }],
    });
    tenantB = await createTenant(dbs.owner.db, {
      courses: [{ slug: "course-b", delivery_mode: "free_async" }],
    });
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("enables and forces RLS with a tenant policy on every table that has tenant_id", async () => {
    const { rows } = await dbs.app.db.execute<{
      table: string;
      enabled: boolean;
      forced: boolean;
      policies: number;
    }>(sql`
      select c.relname as table, c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
             (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
                and p.policyname = 'tenant_isolation') as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname not in ('tenant_domains', 'session')
    `);
    expect(rows.length).toBeGreaterThanOrEqual(18);
    for (const row of rows) {
      expect(row, row.table).toMatchObject({ enabled: true, forced: true, policies: 1 });
    }
  });

  it("runs the app as a role that cannot bypass RLS", async () => {
    await expect(assertRlsEnforced(dbs.app.db, "production")).resolves.toBeUndefined();
  });

  it("only shows the current tenant's rows", async () => {
    const seenByA = await withTenant(dbs.app.db, tenantA, (tx) =>
      tx.select({ slug: courses.slug }).from(courses),
    );
    const seenByB = await withTenant(dbs.app.db, tenantB, (tx) =>
      tx.select({ slug: courses.slug }).from(courses),
    );
    expect(seenByA.map((row) => row.slug)).toEqual(["course-a"]);
    expect(seenByB.map((row) => row.slug)).toEqual(["course-b"]);
  });

  it("shows nothing without a tenant context, also on reused pooled connections", async () => {
    // Run a tenant transaction first so the pooled connection has had app.tenant_id set.
    await withTenant(dbs.app.db, tenantA, (tx) => tx.select().from(courses));
    for (let i = 0; i < 3; i++) {
      expect(await dbs.app.db.select().from(courses)).toEqual([]);
    }
  });

  it("rejects writes into another tenant", async () => {
    const attempt = withTenant(dbs.app.db, tenantA, (tx) =>
      tx.insert(courses).values({ tenantId: tenantB, slug: "smuggled", title: { en: "Smuggled" } }),
    );
    await expect(attempt).rejects.toSatisfy((error) => pgCode(error) === "42501");
  });

  it("cannot update or delete another tenant's rows", async () => {
    const updated = await withTenant(dbs.app.db, tenantA, (tx) =>
      tx.update(courses).set({ estMinutes: 1 }).where(eq(courses.slug, "course-b")).returning(),
    );
    const deleted = await withTenant(dbs.app.db, tenantA, (tx) =>
      tx.delete(courses).where(eq(courses.slug, "course-b")).returning(),
    );
    expect(updated).toEqual([]);
    expect(deleted).toEqual([]);
  });

  it("refuses cross-tenant references at the schema level", async () => {
    const [courseB] = await withTenant(dbs.app.db, tenantB, (tx) =>
      tx.select({ id: courses.id }).from(courses),
    );
    const attempt = withTenant(dbs.app.db, tenantA, async (tx) => {
      const [path] = await tx
        .insert(paths)
        .values({ tenantId: tenantA, slug: "mixed", title: { en: "Mixed" } })
        .returning({ id: paths.id });
      await tx
        .insert(pathCourses)
        .values({ tenantId: tenantA, pathId: path!.id, courseId: courseB!.id, position: 0 });
    });
    await expect(attempt).rejects.toSatisfy((error) => pgCode(error) === "23503");
  });

  it("validates tenant ids before touching the database", async () => {
    await expect(
      withTenant(dbs.app.db, "'; drop table courses; --", async () => 1),
    ).rejects.toThrow(/Invalid tenant id/);
  });

  it("cascades a learner's deletion through every academy despite RLS", async () => {
    const learner = await createUser(dbs.owner.db);
    for (const tenant of [tenantA, tenantB]) {
      await withTenant(dbs.app.db, tenant, async (tx) => {
        const [course] = await tx.select({ id: courses.id }).from(courses);
        await tx
          .insert(enrollments)
          .values({ tenantId: tenant, userId: learner, courseId: course!.id, locale: "en" });
      });
    }
    await dbs.owner.db.execute(sql`delete from "user" where id = ${learner}`);
    for (const tenant of [tenantA, tenantB]) {
      const left = await withTenant(dbs.app.db, tenant, (tx) =>
        tx.select().from(enrollments).where(eq(enrollments.userId, learner)),
      );
      expect(left).toEqual([]);
    }
  });
});
