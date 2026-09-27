import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { courseProgress, resumeLessonKey, type LessonProgressMap } from "@/core/courses/lessons";
import { nextStep } from "@/core/courses/next-step";
import { gradePercent } from "@/core/questions/questions";
import type { TenantContext } from "@/core/tenant/context";
import type { Database } from "@/db/client";
import {
  cohortMembers,
  cohorts,
  consents,
  courses,
  credentials,
  enrollments,
  events,
  files,
  learnerProfiles,
  lessons,
  levelGrants,
  memberships,
  notifications,
  paths,
  reviews,
  session,
  submissions,
  testAttempts,
  user,
  webhookDeliveries,
} from "@/db/schema";
import { withTenant, withUser } from "@/db/tenant-scope";
import { testStates, workOutcomes } from "@/server/learning";
import { deleteUnderPrefix, storageConfigured } from "@/server/storage";
import { queueWebhookEvent } from "@/server/webhooks";

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
    const courseIds = courseRows.map((row) => row.course.id);
    const work = await workOutcomes(tx, userId, courseIds);
    const tests = await testStates(tx, userId, courseIds);
    return {
      profile: profile ?? null,
      path: path ?? null,
      courses: courseRows.map(({ enrollment, course }) => {
        const keys = lessonKeys
          .filter((l) => l.courseId === course.id && l.locale === enrollment.locale)
          .map((l) => l.key);
        const progress = enrollment.lessonProgress as LessonProgressMap;
        return {
          course,
          enrollment,
          progress: courseProgress(keys, progress),
          /** What the learner does next while the course is in progress. */
          next: nextStep({
            mode: course.completionMode,
            resumeKey: resumeLessonKey(keys, progress),
            work: work.get(course.id) ?? null,
            test: tests.get(course.id) ?? { taken: false, passed: false },
          }),
        };
      }),
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
    const [before] = await tx
      .select({ confirmedAt: consents.confirmedAt, revokedAt: consents.revokedAt })
      .from(consents)
      .where(and(eq(consents.userId, userId), eq(consents.kind, "lead_handoff")));
    const wasGiven = Boolean(before?.confirmedAt && !before.revokedAt);
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
    // A CRM following the academy learns about changes, not about repeated saves.
    if (optIn !== wasGiven) {
      await queueWebhookEvent(tx, {
        tenantId: tenant.id,
        type: optIn ? "contact_consent_given" : "contact_consent_withdrawn",
        userId,
      });
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
      testAttempts: (
        await tx
          .select({
            course: courses.slug,
            attempt: testAttempts.attemptNo,
            takenAt: testAttempts.createdAt,
            locale: testAttempts.locale,
            correct: testAttempts.correct,
            total: testAttempts.total,
            passed: testAttempts.passed,
            answers: testAttempts.answers,
          })
          .from(testAttempts)
          .innerJoin(courses, eq(courses.id, testAttempts.courseId))
          .where(eq(testAttempts.userId, userId))
          .orderBy(asc(testAttempts.createdAt))
      ).map((attempt) => ({ ...attempt, percent: gradePercent(attempt) })),
      credentials: await tx.select().from(credentials).where(eq(credentials.userId, userId)),
      files: await tx
        .select({
          id: files.id,
          purpose: files.purpose,
          name: files.name,
          contentType: files.contentType,
          sizeBytes: files.sizeBytes,
          createdAt: files.createdAt,
        })
        .from(files)
        .where(eq(files.ownerUserId, userId)),
      consents: await tx
        .select({
          kind: consents.kind,
          wording: consents.wording,
          requestedAt: consents.requestedAt,
          confirmedAt: consents.confirmedAt,
          revokedAt: consents.revokedAt,
        })
        .from(consents)
        .where(eq(consents.userId, userId)),
      cohorts: await tx
        .select({ name: cohorts.name, joinedAt: cohortMembers.joinedAt })
        .from(cohortMembers)
        .innerJoin(cohorts, eq(cohorts.id, cohortMembers.cohortId))
        .where(eq(cohortMembers.userId, userId)),
      mails: await tx
        .select({
          kind: notifications.kind,
          status: notifications.status,
          createdAt: notifications.createdAt,
          processedAt: notifications.processedAt,
        })
        .from(notifications)
        .where(eq(notifications.userId, userId)),
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
  // Files first: if storage fails, nothing is half deleted and the learner can try again.
  if (storageConfigured()) {
    for (const area of ["submissions", "credentials", "exports"]) {
      await deleteUnderPrefix(tenant.id, `${area}/${userId}/`);
    }
  }
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
    await tx.delete(testAttempts).where(eq(testAttempts.userId, userId));
    await tx.delete(credentials).where(eq(credentials.userId, userId));
    await tx.delete(enrollments).where(eq(enrollments.userId, userId));
    await tx.delete(levelGrants).where(eq(levelGrants.userId, userId));
    await tx.delete(consents).where(eq(consents.userId, userId));
    await tx.delete(notifications).where(eq(notifications.userId, userId));
    await tx.delete(cohortMembers).where(eq(cohortMembers.userId, userId));
    await tx.delete(webhookDeliveries).where(eq(webhookDeliveries.userId, userId));
    await tx.delete(learnerProfiles).where(eq(learnerProfiles.userId, userId));
    await tx.delete(files).where(eq(files.ownerUserId, userId));
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
