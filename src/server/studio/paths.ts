import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import sharp from "sharp";

import type { LocalizedText } from "@/core/i18n/locales";
import { computeLevel, type LevelDefinition } from "@/core/levels/rules";
import { slugify } from "@/core/shared/slug";
import type { TenantContext } from "@/core/tenant/context";
import type { Database, Transaction } from "@/db/client";
import {
  courses,
  credentials,
  enrollments,
  learnerProfiles,
  levelGrants,
  levelSchemes,
  pathCourses,
  paths,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { trackEvent } from "@/server/events";
import { fileBytes, fileUrl, loadFile, storeFile } from "@/server/files";
import { queueLevelUp } from "@/server/notifications";

/*
 * Paths and levels in the Studio (brief §4, optional modules). Manifests can
 * still set them; this is how academies manage them themselves.
 */

export type PathVisual = { svg?: string; png?: string };

export async function listStudioPaths(db: Database, tenantId: string) {
  return withTenant(db, tenantId, async (tx) => {
    const rows = await tx.select().from(paths).orderBy(asc(paths.position), asc(paths.createdAt));
    const links = await tx
      .select({
        pathId: pathCourses.pathId,
        courseId: pathCourses.courseId,
        position: pathCourses.position,
        title: courses.title,
        status: courses.status,
      })
      .from(pathCourses)
      .innerJoin(courses, eq(courses.id, pathCourses.courseId))
      .orderBy(asc(pathCourses.position));
    const learners = await tx
      .select({ pathId: learnerProfiles.currentPathId, n: sql<number>`count(*)::int` })
      .from(learnerProfiles)
      .groupBy(learnerProfiles.currentPathId);
    return rows.map((path) => ({
      path,
      courses: links.filter((link) => link.pathId === path.id),
      learners: learners.find((row) => row.pathId === path.id)?.n ?? 0,
    }));
  });
}

async function uniquePathSlug(tx: Transaction, wanted: string, except?: string): Promise<string> {
  const base = slugify(wanted).slice(0, 48) || "path";
  const taken = new Set(
    (await tx.select({ id: paths.id, slug: paths.slug }).from(paths))
      .filter((row) => row.id !== except)
      .map((row) => row.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export async function createPath(
  db: Database,
  tenantId: string,
  input: { title: LocalizedText; slugFrom: string },
): Promise<string> {
  return withTenant(db, tenantId, async (tx) => {
    const [{ last } = { last: null }] = await tx.select({ last: max(paths.position) }).from(paths);
    const [row] = await tx
      .insert(paths)
      .values({
        tenantId,
        slug: await uniquePathSlug(tx, input.slugFrom),
        title: input.title,
        position: (last ?? -1) + 1,
      })
      .returning({ id: paths.id });
    return row!.id;
  });
}

export async function loadStudioPath(db: Database, tenantId: string, pathId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(pathId)) return null;
  return withTenant(db, tenantId, async (tx) => {
    const [path] = await tx.select().from(paths).where(eq(paths.id, pathId));
    if (!path) return null;
    const inPath = await tx
      .select({ courseId: pathCourses.courseId, position: pathCourses.position })
      .from(pathCourses)
      .where(eq(pathCourses.pathId, pathId))
      .orderBy(asc(pathCourses.position));
    const allCourses = await tx
      .select({ id: courses.id, title: courses.title, status: courses.status })
      .from(courses)
      .orderBy(asc(courses.createdAt));
    return { path, courseIds: inPath.map((row) => row.courseId), allCourses };
  });
}

export async function updatePath(
  db: Database,
  tenantId: string,
  pathId: string,
  input: {
    title: LocalizedText;
    promise: LocalizedText | null;
    color: string | null;
    slug: string;
  },
): Promise<void> {
  await withTenant(db, tenantId, async (tx) => {
    await tx
      .update(paths)
      .set({
        title: input.title,
        promise: input.promise,
        color: input.color,
        slug: await uniquePathSlug(tx, input.slug, pathId),
      })
      .where(eq(paths.id, pathId));
  });
}

/** The ordered courses of a path (only this academy's courses: composite keys refuse others). */
export async function setPathCourses(
  db: Database,
  tenantId: string,
  pathId: string,
  courseIds: readonly string[],
): Promise<void> {
  await withTenant(db, tenantId, async (tx) => {
    await tx.delete(pathCourses).where(eq(pathCourses.pathId, pathId));
    const unique = [...new Set(courseIds)];
    if (unique.length === 0) return;
    await tx
      .insert(pathCourses)
      .values(unique.map((courseId, position) => ({ tenantId, pathId, courseId, position })));
  });
}

export async function movePath(
  db: Database,
  tenantId: string,
  pathId: string,
  direction: "up" | "down",
): Promise<void> {
  await withTenant(db, tenantId, async (tx) => {
    const rows = await tx
      .select({ id: paths.id })
      .from(paths)
      .orderBy(asc(paths.position), asc(paths.createdAt));
    const index = rows.findIndex((row) => row.id === pathId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= rows.length) return;
    const order = rows.map((row) => row.id);
    [order[index], order[target]] = [order[target]!, order[index]!];
    for (const [position, id] of order.entries()) {
      await tx.update(paths).set({ position }).where(eq(paths.id, id));
    }
  });
}

/** Deletes a path nobody has chosen or earned a credential in; otherwise says why not. */
export async function deletePath(
  db: Database,
  tenantId: string,
  pathId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  return withTenant(db, tenantId, async (tx) => {
    const [used] = await tx
      .select({
        learners: sql<number>`(select count(*)::int from ${learnerProfiles} where current_path_id = ${pathId})`,
        enrollments: sql<number>`(select count(*)::int from ${enrollments} where path_id = ${pathId})`,
        credentials: sql<number>`(select count(*)::int from ${credentials} where path_id = ${pathId})`,
      })
      .from(paths)
      .where(eq(paths.id, pathId));
    if (!used) return { ok: true };
    if (used.learners + used.enrollments + used.credentials > 0) {
      return {
        ok: false,
        reason:
          "Learners have chosen this path or earned credentials in it, so it stays. Remove its courses or rename it instead.",
      };
    }
    await tx.delete(paths).where(eq(paths.id, pathId));
    return { ok: true };
  });
}

/**
 * A path picture from an upload: SVGs are kept for sharp display and also
 * rasterised to PNG for credential images (brief §11, Images).
 */
export async function pathVisualFromUpload(
  db: Database,
  tenantId: string,
  fileId: string,
  createdBy: string,
): Promise<PathVisual | null> {
  const record = await loadFile(db, tenantId, fileId);
  if (!record || record.purpose !== "path_visual") return null;
  if (record.contentType !== "image/svg+xml") {
    return { png: `${fileUrl(record)}.${record.contentType === "image/webp" ? "webp" : "png"}` };
  }
  const png = await sharp(Buffer.from(await fileBytes(record)), { density: 288 })
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const raster = await storeFile(db, tenantId, {
    purpose: "path_visual",
    body: new Uint8Array(png),
    name: record.name.replace(/\.svg$/i, ".png"),
    createdBy,
  });
  return { svg: `${fileUrl(record)}.svg`, png: `${fileUrl(raster)}.png` };
}

export async function setPathVisual(
  db: Database,
  tenantId: string,
  pathId: string,
  visual: PathVisual | null,
): Promise<void> {
  await withTenant(db, tenantId, (tx) =>
    tx.update(paths).set({ visual }).where(eq(paths.id, pathId)),
  );
}

export async function loadLevels(db: Database, tenantId: string): Promise<LevelDefinition[]> {
  const [scheme] = await withTenant(db, tenantId, (tx) => tx.select().from(levelSchemes));
  return scheme?.levels ?? [];
}

export async function saveLevels(
  db: Database,
  tenantId: string,
  levels: LevelDefinition[],
): Promise<void> {
  await withTenant(db, tenantId, async (tx) => {
    if (levels.length === 0) {
      await tx.delete(levelSchemes).where(eq(levelSchemes.tenantId, tenantId));
      return;
    }
    await tx
      .insert(levelSchemes)
      .values({ tenantId, levels })
      .onConflictDoUpdate({ target: levelSchemes.tenantId, set: { levels } });
  });
}

/** Learners' manual levels (e.g. "Mentor"), for the People page. */
export async function listLevelGrants(db: Database, tenantId: string) {
  return withTenant(db, tenantId, (tx) =>
    tx
      .select({
        id: levelGrants.id,
        userId: levelGrants.userId,
        pathId: levelGrants.pathId,
        levelN: levelGrants.levelN,
        reason: levelGrants.reason,
        grantedAt: levelGrants.grantedAt,
      })
      .from(levelGrants),
  );
}

/**
 * Grants a `manual_grant` level; it counts from now on (credentials issued
 * earlier keep the level they were issued at). Records `level_up` when the
 * learner's level in that path actually rises.
 */
export async function grantLevel(
  db: Database,
  tenant: TenantContext,
  input: {
    userId: string;
    pathId: string;
    levelN: number;
    grantedBy: string;
    reason: string | null;
  },
): Promise<{ ok: true; levelUp: boolean } | { ok: false; reason: string }> {
  return withTenant(db, tenant.id, async (tx) => {
    const [scheme] = await tx.select().from(levelSchemes);
    const level = scheme?.levels.find((candidate) => candidate.n === input.levelN);
    if (!level || level.rule.type !== "manual_grant") {
      return { ok: false, reason: "Only levels with the rule “manual grant” can be granted." };
    }
    const pathCourseIds = (
      await tx
        .select({ courseId: pathCourses.courseId })
        .from(pathCourses)
        .where(eq(pathCourses.pathId, input.pathId))
    ).map((row) => row.courseId);
    const completedCourseIds = (
      await tx
        .select({ courseId: credentials.courseId })
        .from(credentials)
        .where(and(eq(credentials.userId, input.userId), sql`${credentials.revokedAt} is null`))
    ).map((row) => row.courseId);
    const granted = (
      await tx
        .select({ n: levelGrants.levelN })
        .from(levelGrants)
        .where(and(eq(levelGrants.userId, input.userId), eq(levelGrants.pathId, input.pathId)))
    ).map((row) => row.n);
    const before = computeLevel(scheme!.levels, {
      pathCourseIds,
      completedCourseIds,
      grantedLevels: granted,
    });
    await tx
      .insert(levelGrants)
      .values({
        tenantId: tenant.id,
        userId: input.userId,
        pathId: input.pathId,
        levelN: input.levelN,
        grantedBy: input.grantedBy,
        reason: input.reason,
      })
      .onConflictDoNothing();
    const after = computeLevel(scheme!.levels, {
      pathCourseIds,
      completedCourseIds,
      grantedLevels: [...granted, input.levelN],
    });
    const levelUp = Boolean(after && (!before || after.n > before.n));
    if (levelUp) {
      await trackEvent(tx, {
        tenantId: tenant.id,
        name: "level_up",
        userId: input.userId,
        pathId: input.pathId,
        props: { level: input.levelN, manual: true },
      });
      await queueLevelUp(tx, tenant.id, {
        userId: input.userId,
        pathId: input.pathId,
        level: input.levelN,
      });
    }
    return { ok: true, levelUp };
  });
}

export async function revokeLevelGrant(db: Database, tenantId: string, grantId: string) {
  await withTenant(db, tenantId, (tx) => tx.delete(levelGrants).where(eq(levelGrants.id, grantId)));
}

/** Courses by id, for labels in path pickers. */
export async function courseTitles(db: Database, tenantId: string, ids: readonly string[]) {
  if (ids.length === 0) return [];
  return withTenant(db, tenantId, (tx) =>
    tx
      .select({ id: courses.id, title: courses.title })
      .from(courses)
      .where(inArray(courses.id, [...ids])),
  );
}
