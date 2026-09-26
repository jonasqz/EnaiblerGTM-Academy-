import { and, asc, eq, inArray } from "drizzle-orm";

import type { TenantContext } from "@/core/tenant/context";
import { getDb } from "@/db/client";
import { courses, enrollments, lessons, pathCourses, paths } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";

export type PathRow = typeof paths.$inferSelect;
export type CourseRow = typeof courses.$inferSelect;

/** Learner-facing catalogue: only published courses, paths in author order. */
export async function loadCatalog(tenant: TenantContext) {
  return withTenant(getDb(), tenant.id, async (tx) => ({
    paths: tenant.settings.features.paths
      ? await tx.select().from(paths).orderBy(asc(paths.position))
      : [],
    courses: await tx
      .select()
      .from(courses)
      .where(eq(courses.status, "published"))
      .orderBy(asc(courses.createdAt)),
  }));
}

export async function loadPath(tenant: TenantContext, slug: string) {
  if (!tenant.settings.features.paths) return null;
  return withTenant(getDb(), tenant.id, async (tx) => {
    const [path] = await tx.select().from(paths).where(eq(paths.slug, slug));
    if (!path) return null;
    const ordered = await tx
      .select({ course: courses })
      .from(pathCourses)
      .innerJoin(courses, eq(courses.id, pathCourses.courseId))
      .where(and(eq(pathCourses.pathId, path.id), eq(courses.status, "published")))
      .orderBy(asc(pathCourses.position));
    const position = (
      await tx.select({ id: paths.id }).from(paths).orderBy(asc(paths.position))
    ).findIndex((row) => row.id === path.id);
    return { path, position, courses: ordered.map((row) => row.course) };
  });
}

export async function loadCourse(tenant: TenantContext, slug: string, viewerId: string | null) {
  return withTenant(getDb(), tenant.id, async (tx) => {
    const [course] = await tx
      .select()
      .from(courses)
      .where(and(eq(courses.slug, slug), eq(courses.status, "published")));
    if (!course) return null;
    const lessonRows = await tx
      .select({
        key: lessons.key,
        title: lessons.title,
        locale: lessons.locale,
        position: lessons.position,
      })
      .from(lessons)
      .where(and(eq(lessons.courseId, course.id), inArray(lessons.locale, course.languages)))
      .orderBy(asc(lessons.position));
    const [enrollment] = viewerId
      ? await tx
          .select()
          .from(enrollments)
          .where(and(eq(enrollments.courseId, course.id), eq(enrollments.userId, viewerId)))
      : [];
    return { course, lessons: lessonRows, enrollment: enrollment ?? null };
  });
}
