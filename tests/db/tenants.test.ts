import { readFileSync } from "node:fs";

import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseTenantManifestYaml, type TenantManifest } from "@/core/tenant/manifest";
import { themeToCssVariables } from "@/core/theme/css";
import { courses, levelSchemes, pathCourses, paths, tenants } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { applyTenantManifest, findTenantByDomain, findTenantBySlug } from "@/db/tenants";

import {
  hasDatabase,
  openTestDatabases,
  testManifest,
  uniqueSlug,
  type TestDatabases,
} from "./helpers";

function tenant0(): TenantManifest {
  const source = readFileSync(
    new URL("../../config/tenants/scaling-product.yaml", import.meta.url),
    "utf8",
  );
  const result = parseTenantManifestYaml(source);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.manifest;
}

describe.skipIf(!hasDatabase)("tenant manifests in the database", () => {
  let dbs: TestDatabases;

  beforeAll(async () => {
    dbs = await openTestDatabases();
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("applies tenant 0 as pure configuration, idempotently", async () => {
    const manifest = tenant0();
    const first = await applyTenantManifest(dbs.owner.db, manifest);
    const second = await applyTenantManifest(dbs.owner.db, manifest);
    expect(second.tenantId).toBe(first.tenantId);

    const loaded = await findTenantByDomain(dbs.app.db, "academy.scaling-product.com");
    expect(loaded).not.toBeNull();
    expect(loaded!.slug).toBe("scaling-product");
    expect(loaded!.primaryDomain).toBe("academy.scaling-product.com");
    expect(loaded!.settings.features.levels).toBe(true);
    expect(loaded!.terminology.artifact).toEqual({ en: "Loot", de: "Loot" });
    expect(themeToCssVariables(loaded!.theme)["--tenant-shadow"]).toBe("4px 4px 0px #2E2A36");

    const content = await withTenant(dbs.app.db, first.tenantId, async (tx) => ({
      paths: await tx.select({ slug: paths.slug }).from(paths).orderBy(asc(paths.position)),
      courses: await tx
        .select({ slug: courses.slug, status: courses.status })
        .from(courses)
        .orderBy(asc(courses.slug)),
      levels: await tx.select().from(levelSchemes),
    }));
    expect(content.paths.map((row) => row.slug)).toEqual([
      "validator",
      "builder",
      "scaler",
      "navigator",
    ]);
    expect(content.courses).toEqual([
      { slug: "market-sizing-with-ai", status: "draft" },
      { slug: "validation-lab", status: "draft" },
    ]);
    expect(content.levels[0]?.levels.map((level) => level.n)).toEqual([1, 2, 3, 4]);
  });

  it("keeps authored course titles and path order when re-applying", async () => {
    const slug = uniqueSlug("keep");
    const withCourses = testManifest(slug, {
      courses: [
        { slug: "one", delivery_mode: "free_async" },
        { slug: "two", delivery_mode: "free_async" },
      ],
      paths: [{ title: "Builder", courses: ["two", "one"] }],
    });
    const parsed = parseTenantManifestYaml(JSON.stringify(withCourses));
    if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
    const { tenantId } = await applyTenantManifest(dbs.owner.db, parsed.manifest);

    await withTenant(dbs.app.db, tenantId, (tx) =>
      tx
        .update(courses)
        .set({ title: { en: "Authored title" } })
        .where(eq(courses.slug, "one")),
    );
    // Same manifest, but the path no longer lists courses: order stays as it was.
    const again = parseTenantManifestYaml(
      JSON.stringify({ ...withCourses, paths: [{ title: "Builder" }] }),
    );
    if (!again.ok) throw new Error(again.errors.join("\n"));
    await applyTenantManifest(dbs.owner.db, again.manifest);

    const state = await withTenant(dbs.app.db, tenantId, async (tx) => ({
      title: (
        await tx.select({ title: courses.title }).from(courses).where(eq(courses.slug, "one"))
      )[0]?.title,
      order: (
        await tx
          .select({ slug: courses.slug })
          .from(pathCourses)
          .innerJoin(courses, eq(courses.id, pathCourses.courseId))
          .orderBy(asc(pathCourses.position))
      ).map((row) => row.slug),
    }));
    expect(state.title).toEqual({ en: "Authored title" });
    expect(state.order).toEqual(["two", "one"]);
  });

  it("moves domains and refuses to take another tenant's domain", async () => {
    const slug = uniqueSlug("dom");
    const manifest = testManifest(slug);
    const first = parseTenantManifestYaml(JSON.stringify(manifest));
    if (!first.ok) throw new Error(first.errors.join("\n"));
    await applyTenantManifest(dbs.owner.db, first.manifest);

    const moved = parseTenantManifestYaml(
      JSON.stringify({
        ...manifest,
        tenant: {
          ...manifest.tenant,
          domains: [`new-${slug}.academy.test`, `${slug}.academy.test`],
        },
      }),
    );
    if (!moved.ok) throw new Error(moved.errors.join("\n"));
    await applyTenantManifest(dbs.owner.db, moved.manifest);
    expect((await findTenantBySlug(dbs.app.db, slug))?.primaryDomain).toBe(
      `new-${slug}.academy.test`,
    );

    const thief = parseTenantManifestYaml(
      JSON.stringify(
        testManifest(uniqueSlug("thief"), {
          tenant: { ...manifest.tenant, slug: uniqueSlug("thief") },
        }),
      ),
    );
    if (!thief.ok) throw new Error(thief.errors.join("\n"));
    await expect(applyTenantManifest(dbs.owner.db, thief.manifest)).rejects.toThrow(
      /already belongs to another tenant/,
    );
    // The failed apply rolled back completely.
    expect(
      await dbs.app.db.select().from(tenants).where(eq(tenants.slug, thief.manifest.tenant.slug)),
    ).toEqual([]);
  });
});
