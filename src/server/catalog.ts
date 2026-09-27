import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { requiresWork } from "@/core/courses/completion";
import { courseProgress, type LessonProgressMap } from "@/core/courses/lessons";
import type { LocalizedText } from "@/core/i18n/locales";
import type { TenantContext } from "@/core/tenant/context";
import { getDb } from "@/db/client";
import {
  assignments,
  courses,
  credentials,
  enrollments,
  lessons,
  pathCourses,
  paths,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";

export type PathRow = typeof paths.$inferSelect;
export type CourseRow = typeof courses.$inferSelect;

export interface CatalogCourse {
  course: CourseRow;
  /** What learners build; null when the course ends with its final test alone. */
  artifactName: LocalizedText | null;
  lessonCount: number;
  /** For a signed-in learner: their state in this course. */
  status: { percent: number; completed: boolean } | null;
}

async function catalogCourses(
  tenantId: string,
  courseIds: string[] | null,
  viewerId: string | null,
) {
  return withTenant(getDb(), tenantId, async (tx) => {
    const rows = await tx
      .select({
        course: courses,
        artifactName: assignments.artifactName,
        lessonCount: sql<number>`(select count(distinct l.key)::int from ${lessons} l where l.course_id = "courses"."id")`,
      })
      .from(courses)
      .leftJoin(assignments, eq(assignments.courseId, courses.id))
      .where(
        and(
          eq(courses.status, "published"),
          courseIds
            ? inArray(
                courses.id,
                courseIds.length ? courseIds : ["00000000-0000-0000-0000-000000000000"],
              )
            : undefined,
        ),
      )
      .orderBy(asc(courses.createdAt));

    const status = new Map<string, { percent: number; completed: boolean }>();
    if (viewerId && rows.length) {
      const ids = rows.map((row) => row.course.id);
      const mine = await tx
        .select()
        .from(enrollments)
        .where(and(eq(enrollments.userId, viewerId), inArray(enrollments.courseId, ids)));
      const keys = await tx
        .select({ courseId: lessons.courseId, locale: lessons.locale, key: lessons.key })
        .from(lessons)
        .where(inArray(lessons.courseId, ids));
      const earned = new Set(
        (
          await tx
            .select({ courseId: credentials.courseId })
            .from(credentials)
            .where(and(eq(credentials.userId, viewerId), isNull(credentials.revokedAt)))
        ).map((row) => row.courseId),
      );
      for (const enrollment of mine) {
        const lessonKeys = keys
          .filter((row) => row.courseId === enrollment.courseId && row.locale === enrollment.locale)
          .map((row) => row.key);
        status.set(enrollment.courseId, {
          percent: courseProgress(lessonKeys, enrollment.lessonProgress as LessonProgressMap)
            .percent,
          completed: earned.has(enrollment.courseId),
        });
      }
    }
    return rows.map((row): CatalogCourse => ({
      course: row.course,
      // A test-only course keeps its assignment for later; it promises no work.
      artifactName: requiresWork(row.course.completionMode) ? row.artifactName : null,
      lessonCount: row.lessonCount,
      status: status.get(row.course.id) ?? null,
    }));
  });
}

/** Learner-facing catalogue: only published courses, paths in author order. */
export async function loadCatalog(tenant: TenantContext, viewerId: string | null) {
  const pathRows = tenant.settings.features.paths
    ? await withTenant(getDb(), tenant.id, (tx) =>
        tx.select().from(paths).orderBy(asc(paths.position)),
      )
    : [];
  return { paths: pathRows, courses: await catalogCourses(tenant.id, null, viewerId) };
}

export async function loadPath(tenant: TenantContext, slug: string, viewerId: string | null) {
  if (!tenant.settings.features.paths) return null;
  const found = await withTenant(getDb(), tenant.id, async (tx) => {
    const all = await tx.select().from(paths).orderBy(asc(paths.position));
    const index = all.findIndex((row) => row.slug === slug);
    const path = all[index];
    if (!path) return null;
    const order = await tx
      .select({ courseId: pathCourses.courseId })
      .from(pathCourses)
      .where(eq(pathCourses.pathId, path.id))
      .orderBy(asc(pathCourses.position));
    return { path, position: index, order: order.map((row) => row.courseId) };
  });
  if (!found) return null;
  const list = await catalogCourses(tenant.id, found.order, viewerId);
  const byId = new Map(list.map((entry) => [entry.course.id, entry]));
  return {
    path: found.path,
    position: found.position,
    courses: found.order.flatMap((id) => {
      const entry = byId.get(id);
      return entry ? [entry] : [];
    }),
  };
}
