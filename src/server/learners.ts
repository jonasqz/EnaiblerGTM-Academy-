import { and, eq } from "drizzle-orm";

import type { EntryContext } from "@/core/entry/context";
import type { Locale } from "@/core/i18n/locales";
import type { TenantContext } from "@/core/tenant/context";
import type { Transaction } from "@/db/client";
import { courses, enrollments, learnerProfiles, memberships, paths } from "@/db/schema";
import { trackEvent } from "@/server/events";

/**
 * Makes the user a learner of this academy (membership + profile). Returns
 * whether this is their first time here, i.e. a completed sign-up.
 */
export async function ensureLearner(
  tx: Transaction,
  tenant: TenantContext,
  userId: string,
  options: { locale: Locale; entry: EntryContext },
): Promise<{ created: boolean }> {
  const inserted = await tx
    .insert(memberships)
    .values({ tenantId: tenant.id, userId, role: "learner" })
    .onConflictDoNothing()
    .returning({ id: memberships.id });

  let currentPathId: string | null = null;
  if (tenant.settings.features.paths && options.entry.path) {
    const [path] = await tx
      .select({ id: paths.id })
      .from(paths)
      .where(eq(paths.slug, options.entry.path));
    currentPathId = path?.id ?? null;
  }

  await tx
    .insert(learnerProfiles)
    .values({
      tenantId: tenant.id,
      userId,
      locale: options.entry.lang ?? options.locale,
      currentPathId,
    })
    .onConflictDoNothing();

  const created = inserted.length > 0;
  if (created) {
    await trackEvent(tx, {
      tenantId: tenant.id,
      name: "signup_completed",
      userId,
      pathId: currentPathId,
      locale: options.entry.lang ?? options.locale,
      entry: options.entry,
    });
  }
  return { created };
}

/** Enrolls the learner in a published course; idempotent. The entry context is kept on the enrollment. */
export async function ensureEnrollment(
  tx: Transaction,
  tenant: TenantContext,
  userId: string,
  options: { courseSlug: string; locale: Locale; entry: EntryContext },
): Promise<{ enrollmentId: string; created: boolean } | null> {
  const [course] = await tx
    .select({ id: courses.id, languages: courses.languages })
    .from(courses)
    .where(and(eq(courses.slug, options.courseSlug), eq(courses.status, "published")));
  if (!course) return null;

  let pathId: string | null = null;
  if (options.entry.path) {
    const [path] = await tx
      .select({ id: paths.id })
      .from(paths)
      .where(eq(paths.slug, options.entry.path));
    pathId = path?.id ?? null;
  }

  const locale = course.languages.includes(options.locale)
    ? options.locale
    : (course.languages[0] ?? options.locale);
  const inserted = await tx
    .insert(enrollments)
    .values({
      tenantId: tenant.id,
      userId,
      courseId: course.id,
      pathId,
      locale,
      entryContext: options.entry,
    })
    .onConflictDoNothing()
    .returning({ id: enrollments.id });

  if (inserted[0]) {
    await trackEvent(tx, {
      tenantId: tenant.id,
      name: "course_started",
      userId,
      courseId: course.id,
      pathId,
      locale,
      entry: options.entry,
    });
    return { enrollmentId: inserted[0].id, created: true };
  }

  const [existing] = await tx
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, course.id)));
  return existing ? { enrollmentId: existing.id, created: false } : null;
}
