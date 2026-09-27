import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { courseProgress, type LessonProgressMap } from "@/core/courses/lessons";
import type { TenantContext } from "@/core/tenant/context";
import type { Database } from "@/db/client";
import {
  consents,
  courses,
  credentials,
  enrollments,
  events,
  learnerProfiles,
  lessons,
  levelGrants,
  memberships,
  paths,
  reviews,
  session,
  submissions,
  user,
} from "@/db/schema";
import { withTenant, withUser } from "@/db/tenant-scope";

/*
 * The learner's own data in this academy (brief §5 profile, §9 data rights
 * and lead handoff). Each academy is its own space: export and deletion cover
 * this academy; the global account goes once no academy is left.
 */

export async function loadMe(db: Database, tenant: TenantContext, userId: string) {
  return withTenant(db, tenant.id, async (tx) => {
    const [profile] = await tx
      .select()
      .from(learnerProfiles)
      .where(eq(learnerProfiles.userId, userId));
    const [path] = profile?.currentPathId
      ? await tx.select().from(paths).where(eq(paths.id, profile.currentPathId))
      : [];
    const courseRows = await tx
      .select({ enrollment: enrollments, course: courses })
      .from(enrollments)
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .where(eq(enrollments.userId, userId))
      .orderBy(desc(enrollments.startedAt));
    const lessonKeys = courseRows.length
      ? await tx
          .select({ courseId: lessons.courseId, locale: lessons.locale, key: lessons.key })
          .from(lessons)
          .where(
            inArray(
              lessons.courseId,
              courseRows.map((row) => row.course.id),
            ),
          )
          .orderBy(asc(lessons.position))
      : [];
    const creds = await tx
      .select({ credential: credentials, courseSlug: courses.slug })
      .from(credentials)
      .innerJoin(courses, eq(courses.id, credentials.courseId))
      .where(and(eq(credentials.userId, userId), sql`${credentials.revokedAt} is null`))
      .orderBy(desc(credentials.issuedAt));
    const [handoff] = await tx
      .select()
      .from(consents)
      .where(and(eq(consents.userId, userId), eq(consents.kind, "lead_handoff")));
    return {
      profile: profile ?? null,
      path: path ?? null,
      courses: courseRows.map(({ enrollment, course }) => ({
        course,
        enrollment,
        progress: courseProgress(
          lessonKeys
            .filter((l) => l.courseId === course.id && l.locale === enrollment.locale)
            .map((l) => l.key),
          enrollment.lessonProgress as LessonProgressMap,
        ),
      })),
      credentials: creds,
      contactOptIn: Boolean(handoff?.confirmedAt && !handoff.revokedAt),
    };
  });
}

/** The name on the learner's credentials, exactly as they enter it (brief §4). */
export async function setDisplayName(
  db: Database,
  tenant: TenantContext,
  userId: string,
  name: string,
) {
  const displayName = name.trim().slice(0, 120);
  await withTenant(db, tenant.id, async (tx) => {
    await tx
      .insert(learnerProfiles)
      .values({ tenantId: tenant.id, userId, displayName })
      .onConflictDoUpdate({
        target: [learnerProfiles.tenantId, learnerProfiles.userId],
        set: { displayName },
      });
    await tx.update(credentials).set({ displayName }).where(eq(credentials.userId, userId));
  });
}

/** Lead handoff: an explicit, separate opt-in that can be withdrawn at any time. */
export async function setContactOptIn(
  db: Database,
  tenant: TenantContext,
  userId: string,
  optIn: boolean,
  wording: string,
): Promise<void> {
  await withTenant(db, tenant.id, async (tx) => {
    const now = new Date();
    if (optIn) {
      await tx
        .insert(consents)
        .values({ tenantId: tenant.id, userId, kind: "lead_handoff", wording, confirmedAt: now })
        .onConflictDoUpdate({
          target: [consents.tenantId, consents.userId, consents.kind],
          set: { wording, requestedAt: now, confirmedAt: now, revokedAt: null },
        });
    } else {
      await tx
        .update(consents)
        .set({ revokedAt: now })
        .where(and(eq(consents.userId, userId), eq(consents.kind, "lead_handoff")));
    }
  });
}

/** Everything this academy stores about the learner, as JSON (brief §9). */
export async function exportMyData(db: Database, tenant: TenantContext, userId: string) {
  const [account] = await db
    .select({ email: user.email, createdAt: user.createdAt })
    .from(user)
    .where(eq(user.id, userId));
  const data = await withTenant(db, tenant.id, async (tx) => {
    const mySubmissions = await tx.select().from(submissions).where(eq(submissions.userId, userId));
    return {
      memberships: await tx
        .select({ role: memberships.role, since: memberships.createdAt })
        .from(memberships)
        .where(eq(memberships.userId, userId)),
      profile:
        (await tx.select().from(learnerProfiles).where(eq(learnerProfiles.userId, userId)))[0] ??
        null,
      enrollments: await tx
        .select({ course: courses.slug, enrollment: enrollments })
        .from(enrollments)
        .innerJoin(courses, eq(courses.id, enrollments.courseId))
        .where(eq(enrollments.userId, userId)),
      submissions: mySubmissions,
      reviews: mySubmissions.length
        ? await tx
            .select({
              submissionId: reviews.submissionId,
              reviewer: reviews.reviewerType,
              criteria: reviews.criteria,
              overall: reviews.overall,
              createdAt: reviews.createdAt,
            })
            .from(reviews)
            .where(
              inArray(
                reviews.submissionId,
                mySubmissions.map((row) => row.id),
              ),
            )
        : [],
      credentials: await tx.select().from(credentials).where(eq(credentials.userId, userId)),
      consents: await tx.select().from(consents).where(eq(consents.userId, userId)),
      events: await tx
        .select({
          name: events.name,
          occurredAt: events.occurredAt,
          utm: events.utm,
          props: events.props,
        })
        .from(events)
        .where(eq(events.userId, userId)),
    };
  });
  return {
    exportedAt: new Date().toISOString(),
    academy: tenant.settings.author_display_name,
    account: account ?? null,
    ...data,
  };
}

/**
 * Deletes the learner's data in this academy. Credentials disappear (their
 * verification pages then read "no longer available"). If no other academy
 * knows the learner, the global account goes too; otherwise only this
 * academy's sessions end.
 */
export async function deleteMyData(
  db: Database,
  tenant: TenantContext,
  userId: string,
): Promise<{ accountDeleted: boolean }> {
  await withTenant(db, tenant.id, async (tx) => {
    const mySubmissionIds = (
      await tx
        .select({ id: submissions.id })
        .from(submissions)
        .where(eq(submissions.userId, userId))
    ).map((row) => row.id);
    if (mySubmissionIds.length)
      await tx.delete(reviews).where(inArray(reviews.submissionId, mySubmissionIds));
    await tx.delete(submissions).where(eq(submissions.userId, userId));
    await tx.delete(credentials).where(eq(credentials.userId, userId));
    await tx.delete(enrollments).where(eq(enrollments.userId, userId));
    await tx.delete(levelGrants).where(eq(levelGrants.userId, userId));
    await tx.delete(consents).where(eq(consents.userId, userId));
    await tx.delete(learnerProfiles).where(eq(learnerProfiles.userId, userId));
    await tx.delete(memberships).where(eq(memberships.userId, userId));
    // Keep aggregate numbers, drop the link to the person.
    await tx.update(events).set({ userId: null }).where(eq(events.userId, userId));
  });

  const remaining = await withUser(db, userId, (tx) =>
    tx.select({ n: sql<number>`count(*)::int` }).from(memberships),
  );
  if ((remaining[0]?.n ?? 0) === 0) {
    await db.delete(user).where(eq(user.id, userId));
    return { accountDeleted: true };
  }
  await db.delete(session).where(and(eq(session.userId, userId), eq(session.tenantId, tenant.id)));
  return { accountDeleted: false };
}
