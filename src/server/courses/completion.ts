import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";

import {
  missingParts,
  requiresTest,
  requiresWork,
  type CompletionPart,
} from "@/core/courses/completion";
import { requiresSessions, sessionsProgress } from "@/core/courses/sessions";
import type { LevelDefinition } from "@/core/levels/rules";
import { effectiveOutcome } from "@/core/review/outcome";
import type { TenantContext } from "@/core/tenant/context";
import type { Transaction } from "@/db/client";
import {
  assignments,
  courses,
  credentials,
  enrollments,
  notifications,
  reviews,
  submissions,
  testAttempts,
  webinars,
} from "@/db/schema";
import { courseSessions, learnerSessionFacts, markSessionLessons } from "@/server/courses/sessions";
import { issueCredential } from "@/server/credentials/issue";

/** What completing a course needs of the academy: who it is and how it is set up. */
type Academy = Pick<TenantContext, "id" | "settings">;

/**
 * The learner's latest hand-in for the course, and whether it passed. A
 * human's decision on an overridden result counts over the AI's.
 */
async function latestWork(tx: Transaction, userId: string, courseId: string) {
  const [latest] = await tx
    .select({ id: submissions.id, status: submissions.status })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .where(and(eq(assignments.courseId, courseId), eq(submissions.userId, userId)))
    .orderBy(desc(submissions.attemptNo))
    .limit(1);
  if (!latest) return { passed: false, submissionId: null };
  const [human] = await tx
    .select({ overall: reviews.overall })
    .from(reviews)
    .where(and(eq(reviews.submissionId, latest.id), eq(reviews.reviewerType, "human")))
    .orderBy(desc(reviews.createdAt))
    .limit(1);
  const outcome = effectiveOutcome(latest.status, human ? human.overall.pass : null);
  return { passed: outcome === "passed", submissionId: latest.id };
}

/** The attempt that first passed the final test, if any. */
async function passedTest(tx: Transaction, userId: string, courseId: string) {
  const [attempt] = await tx
    .select({ id: testAttempts.id })
    .from(testAttempts)
    .where(
      and(
        eq(testAttempts.courseId, courseId),
        eq(testAttempts.userId, userId),
        eq(testAttempts.passed, true),
      ),
    )
    .orderBy(asc(testAttempts.attemptNo))
    .limit(1);
  return { passed: Boolean(attempt), attemptId: attempt?.id ?? null };
}

export type CompletionResult =
  | { issued: true; publicId: string; levelUp: LevelDefinition | null }
  | { issued: false; missing: CompletionPart[] };

/**
 * Issues the Certificate of Completion once every part the course asks for is
 * passed (core/courses/completion), in whichever order they came: the work,
 * the test, and in a series its sessions (core/courses/sessions). Call it in
 * the transaction that records a passed part; otherwise it says what is missing.
 */
export async function completeCourse(
  tx: Transaction,
  tenant: Academy,
  input: { userId: string; courseId: string; now?: Date },
): Promise<CompletionResult> {
  const [course] = await tx
    .select({
      completionMode: courses.completionMode,
      sessionRule: courses.sessionRule,
      catchUpDays: courses.catchUpDays,
    })
    .from(courses)
    .where(eq(courses.id, input.courseId));
  if (!course) return { issued: false, missing: [] };
  const mode = course.completionMode;
  const work = requiresWork(mode)
    ? await latestWork(tx, input.userId, input.courseId)
    : { passed: false, submissionId: null };
  const test = requiresTest(mode)
    ? await passedTest(tx, input.userId, input.courseId)
    : { passed: false, attemptId: null };
  const sessions = requiresSessions(course.sessionRule)
    ? sessionsProgress(
        await learnerSessionFacts(tx, input.userId, await courseSessions(tx, input.courseId)),
        { rule: course.sessionRule, catchUpDays: course.catchUpDays },
        input.now ?? new Date(),
      )
    : null;
  const missing = missingParts(
    mode,
    { workPassed: work.passed, testPassed: test.passed, sessionsPassed: sessions?.passed },
    course.sessionRule,
  );
  if (missing.length > 0) return { issued: false, missing };
  const issued = await issueCredential(tx, tenant, {
    userId: input.userId,
    courseId: input.courseId,
    basis: mode,
    sessions: sessions?.evidence ?? [],
    sessionCount: sessions ? sessions.total : null,
    submissionId: work.submissionId,
    testAttemptId: test.attemptId,
  });
  return { issued: true, ...issued };
}

/**
 * The learner took part in a session: checked in, on an attendance list, or
 * past the academy's threshold on its recording. In the transaction that
 * recorded it, the session's lesson is marked done and, when that was the
 * last thing missing, the course completes. Learners who finished already
 * keep their credential as it was.
 */
export async function afterSessionTaken(
  tx: Transaction,
  tenant: Academy,
  input: { userId: string; webinarId: string; now?: Date },
): Promise<CompletionResult | null> {
  const [webinar] = await tx
    .select({ courseId: webinars.courseId })
    .from(webinars)
    .where(eq(webinars.id, input.webinarId));
  if (!webinar?.courseId) return null;
  const courseId = webinar.courseId;
  const sessions = await courseSessions(tx, courseId);
  if (!sessions.some((session) => session.webinar.id === input.webinarId)) return null;
  await markSessionLessons(tx, tenant.id, { userId: input.userId, courseId });
  const [enrollment] = await tx
    .select({ completedAt: enrollments.completedAt })
    .from(enrollments)
    .where(and(eq(enrollments.courseId, courseId), eq(enrollments.userId, input.userId)));
  if (!enrollment || enrollment.completedAt) return null;
  const completion = await completeCourse(tx, tenant, {
    userId: input.userId,
    courseId,
    now: input.now,
  });
  if (completion.issued && completion.levelUp) {
    // No review mail carries the level here, so it gets its own (like a passed test).
    const [issued] = await tx
      .select({ pathId: credentials.pathId })
      .from(credentials)
      .where(eq(credentials.publicId, completion.publicId));
    // Queued here rather than through server/notifications, which (through the
    // review alerts and cohorts) leads back to webinar registration and so here.
    if (issued?.pathId) {
      await tx.insert(notifications).values({
        tenantId: tenant.id,
        userId: input.userId,
        kind: "level_up",
        payload: { pathId: issued.pathId, level: completion.levelUp.n },
      });
    }
  }
  return completion;
}

/**
 * The learner's watching of a video first covered the academy's threshold:
 * each session it is the recording of counts as caught up (within the
 * course's window, which completeCourse judges).
 */
export async function afterRecordingWatched(
  tx: Transaction,
  tenant: Academy,
  input: { userId: string; assetId: string; now?: Date },
): Promise<void> {
  const shownBy = await tx
    .select({ id: webinars.id })
    .from(webinars)
    .where(eq(webinars.recordingAssetId, input.assetId));
  for (const { id } of shownBy) {
    await afterSessionTaken(tx, tenant, { userId: input.userId, webinarId: id, now: input.now });
  }
}

/**
 * Learners an easier ending finishes:it asks for less now (a part dropped,
 * a gentler session rule, a session cancelled) and they had passed the rest.
 * Only learners with passed work or a passed test can be done, since every
 * ending asks for one of them. Issued through completeCourse like any other
 * pass; everyone else finishes as usual.
 */
export async function completeWaitingLearners(
  tx: Transaction,
  tenant: Academy,
  courseId: string,
  now: Date = new Date(),
): Promise<number> {
  const candidates = await tx
    .select({ userId: enrollments.userId })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.courseId, courseId),
        isNull(enrollments.completedAt),
        or(
          sql`exists (select 1 from ${testAttempts} ta where ta.course_id = ${enrollments.courseId} and ta.user_id = ${enrollments.userId} and ta.passed)`,
          sql`exists (select 1 from ${submissions} s join ${assignments} a on a.id = s.assignment_id where a.course_id = ${enrollments.courseId} and s.user_id = ${enrollments.userId} and s.status in ('passed', 'overridden'))`,
        ),
      ),
    );
  let completed = 0;
  for (const { userId } of candidates) {
    if ((await completeCourse(tx, tenant, { userId, courseId, now })).issued) completed += 1;
  }
  return completed;
}
