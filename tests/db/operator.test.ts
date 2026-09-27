import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq, sql } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { consents, courses, memberships, tenants, user } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import {
  deleteAcademy,
  exportAcademy,
  listAcademies,
  NOT_EXPORTED,
  setAcademyStatus,
} from "@/server/operator/academies";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

describe.skipIf(!hasDatabase)("operator tasks per academy", () => {
  let dbs: TestDatabases;
  let academy: string;
  let other: string;
  let learner: string;
  let shared: string;

  beforeAll(async () => {
    dbs = await openTestDatabases();
    academy = await createTenant(dbs.owner.db);
    other = await createTenant(dbs.owner.db);
    learner = await createUser(dbs.owner.db);
    shared = await createUser(dbs.owner.db);
    await withTenant(dbs.owner.db, academy, async (tx) => {
      await tx.insert(courses).values({
        tenantId: academy,
        slug: "get-paid",
        title: { en: "Get paid on time" },
        status: "published",
      });
      await tx.insert(memberships).values([
        { tenantId: academy, userId: learner, role: "learner" },
        { tenantId: academy, userId: shared, role: "author" },
      ]);
      await tx.insert(consents).values({
        tenantId: academy,
        userId: learner,
        kind: "lead_handoff",
        wording: "may contact me",
        confirmedAt: new Date(),
      });
    });
    await withTenant(dbs.owner.db, other, (tx) =>
      tx.insert(memberships).values({ tenantId: other, userId: shared, role: "learner" }),
    );
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("lists academies with their team, learners and published courses", async () => {
    const listed = (await listAcademies(dbs.owner.db)).find((entry) => entry.id === academy);
    expect(listed).toMatchObject({ status: "active", team: 1, learners: 1, publishedCourses: 1 });
    expect(listed!.domains).toHaveLength(1);
  });

  it("suspends and resumes an academy", async () => {
    await setAcademyStatus(dbs.owner.db, academy, "suspended");
    const [suspended] = await dbs.owner.db
      .select({ status: tenants.status })
      .from(tenants)
      .where(eq(tenants.id, academy));
    expect(suspended!.status).toBe("suspended");
    await setAcademyStatus(dbs.owner.db, academy, "active");
  });

  it("exports every row of the academy, its people and nothing of other academies", async () => {
    const target = join(tmpdir(), `academy-${academy}.zip`);
    const result = await exportAcademy(dbs.owner.db, academy, target, { withFiles: false });
    const zip = unzipSync(readFileSync(target));
    const json = (name: string) => JSON.parse(strFromU8(zip[name]!)) as unknown;

    expect(json("academy.json")).toMatchObject({ id: academy });
    expect(json("data/courses.json")).toEqual([
      expect.objectContaining({ slug: "get-paid", tenant_id: academy }),
    ]);
    expect(json("data/consents.json")).toHaveLength(1);
    const people = json("data/users.json") as Array<{ id: string }>;
    expect(people.map((person) => person.id).sort()).toEqual([learner, shared].sort());
    // Sessions and integration secrets are not the academy's data.
    for (const table of NOT_EXPORTED) expect(zip[`data/${table}.json`]).toBeUndefined();
    expect(zip["README.txt"]).toBeDefined();
    expect(result.rows).toBeGreaterThanOrEqual(4);
  });

  it("deletes the academy with everything in it, and accounts no other academy knows", async () => {
    const result = await deleteAcademy(dbs.owner.db, academy);
    expect(result.accounts).toBe(1);

    const [gone] = await dbs.owner.db
      .select({ n: sql<number>`count(*)::int` })
      .from(tenants)
      .where(eq(tenants.id, academy));
    expect(gone!.n).toBe(0);
    const [rows] = await withTenant(dbs.owner.db, academy, (tx) =>
      tx.select({ n: sql<number>`count(*)::int` }).from(courses),
    );
    expect(rows!.n).toBe(0);
    const accounts = await dbs.owner.db.select({ id: user.id }).from(user);
    const ids = accounts.map((account) => account.id);
    expect(ids).not.toContain(learner);
    // Still a learner elsewhere: the account and that membership stay.
    expect(ids).toContain(shared);
    const [elsewhere] = await withTenant(dbs.owner.db, other, (tx) =>
      tx.select({ n: sql<number>`count(*)::int` }).from(memberships),
    );
    expect(elsewhere!.n).toBe(1);
  });
});
