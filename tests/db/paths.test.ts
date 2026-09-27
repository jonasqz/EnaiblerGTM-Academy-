import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TenantContext } from "@/core/tenant/context";
import { events, learnerProfiles } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import { fileBytes, loadFile, storeFile } from "@/server/files";
import { createCourse } from "@/server/studio/courses";
import {
  createPath,
  deletePath,
  grantLevel,
  listLevelGrants,
  listStudioPaths,
  loadLevels,
  loadStudioPath,
  movePath,
  pathVisualFromUpload,
  saveLevels,
  setPathCourses,
  updatePath,
} from "@/server/studio/paths";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

const hasStorage = hasDatabase && Boolean(process.env.TEST_S3_ENDPOINT);

describe.skipIf(!hasDatabase)("paths and levels in the Studio", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let author: string;
  let builder: string;
  let validator: string;
  const courseIds: string[] = [];

  beforeAll(async () => {
    if (hasStorage) {
      process.env.S3_ENDPOINT = process.env.TEST_S3_ENDPOINT;
      process.env.S3_BUCKET = `enaibler-test-${randomBytes(4).toString("hex")}`;
      process.env.S3_ACCESS_KEY_ID = "test";
      process.env.S3_SECRET_ACCESS_KEY = "test";
    }
    dbs = await openTestDatabases();
    tenant = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    author = await createUser(dbs.owner.db);
    for (const title of ["Validation Lab", "Market Sizing"]) {
      courseIds.push(
        await createCourse(dbs.app.db, tenant.id, {
          languages: ["en"],
          title,
          artifactName: "Brief",
          outcome: "Write a brief.",
          deliveryMode: "free_async",
        }),
      );
    }
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("creates paths with unique addresses, orders them and their courses", async () => {
    builder = await createPath(dbs.app.db, tenant.id, {
      title: { en: "Builder" },
      slugFrom: "Builder",
    });
    validator = await createPath(dbs.app.db, tenant.id, {
      title: { en: "Builder 2" },
      slugFrom: "Builder",
    });
    await updatePath(dbs.app.db, tenant.id, validator, {
      title: { en: "Validator", de: "Validierer" },
      promise: { en: "Test ideas before you build." },
      color: "#93c6bf",
      slug: "Validator",
    });
    await setPathCourses(dbs.app.db, tenant.id, validator, [
      courseIds[1]!,
      courseIds[0]!,
      courseIds[1]!,
    ]);
    await movePath(dbs.app.db, tenant.id, validator, "up");

    const rows = await listStudioPaths(dbs.app.db, tenant.id);
    expect(
      rows.map((row) => [row.path.slug, row.courses.map((course) => course.courseId)]),
    ).toEqual([
      ["validator", [courseIds[1], courseIds[0]]],
      ["builder", []],
    ]);
    expect((await loadStudioPath(dbs.app.db, tenant.id, builder))?.path.slug).toBe("builder");
  });

  it.skipIf(!hasStorage)(
    "keeps an SVG picture and renders it to PNG for share images",
    async () => {
      const svg = await storeFile(dbs.app.db, tenant.id, {
        purpose: "path_visual",
        body: new TextEncoder().encode(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#2e2a36"/></svg>',
        ),
        name: "validator.svg",
        createdBy: author,
      });
      const visual = await pathVisualFromUpload(dbs.app.db, tenant.id, svg.id, author);
      expect(visual?.svg).toBe(`/files/${svg.id}.svg`);
      const pngId = visual!.png!.match(/\/files\/([0-9a-f-]{36})\.png/)![1]!;
      const png = await loadFile(dbs.app.db, tenant.id, pngId);
      expect(png).toMatchObject({ purpose: "path_visual", contentType: "image/png" });
      expect(await sharp(Buffer.from(await fileBytes(png!))).metadata()).toMatchObject({
        width: 512,
        height: 512,
      });
    },
  );

  it("saves levels and grants manual ones with a level-up", async () => {
    await saveLevels(dbs.app.db, tenant.id, [
      { n: 1, name: { en: "Apprentice" }, rule: { type: "courses_completed_in_path", min: 1 } },
      { n: 2, name: { en: "Pro" }, rule: { type: "path_complete" } },
      { n: 3, name: { en: "Mentor" }, rule: { type: "manual_grant" } },
    ]);
    expect((await loadLevels(dbs.app.db, tenant.id)).map((level) => level.n)).toEqual([1, 2, 3]);

    const learner = await createUser(dbs.owner.db);
    expect(
      await grantLevel(dbs.app.db, tenant, {
        userId: learner,
        pathId: validator,
        levelN: 1,
        grantedBy: author,
        reason: null,
      }),
    ).toMatchObject({ ok: false });
    expect(
      await grantLevel(dbs.app.db, tenant, {
        userId: learner,
        pathId: validator,
        levelN: 3,
        grantedBy: author,
        reason: "Runs the Tuesday clinic",
      }),
    ).toEqual({ ok: true, levelUp: true });
    const [grant] = await listLevelGrants(dbs.app.db, tenant.id);
    expect(grant).toMatchObject({ userId: learner, levelN: 3, reason: "Runs the Tuesday clinic" });
    const levelUps = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(events).where(eq(events.name, "level_up")),
    );
    expect(levelUps).toHaveLength(1);
  });

  it("refuses to delete a path learners chose", async () => {
    const learner = await createUser(dbs.owner.db);
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .insert(learnerProfiles)
        .values({ tenantId: tenant.id, userId: learner, currentPathId: builder }),
    );
    expect((await deletePath(dbs.app.db, tenant.id, builder)).ok).toBe(false);
    const empty = await createPath(dbs.app.db, tenant.id, {
      title: { en: "Scaler" },
      slugFrom: "Scaler",
    });
    expect(await deletePath(dbs.app.db, tenant.id, empty)).toEqual({ ok: true });
  });
});
