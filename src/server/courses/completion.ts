import { and, asc, desc, eq } from "drizzle-orm";

import {
  missingParts,
  requiresTest,
  requiresWork,
  type CompletionPart,
} from "@/core/courses/completion";
import type { LevelDefinition } from "@/core/levels/rules";
import { effectiveOutcome } from "@/core/review/outcome";
import type { TenantContext } from "@/core/tenant/context";
import type { Transaction } from "@/db/client";
import { assignments, courses, reviews, submissions, testAttempts } from "@/db/schema";
import { issueCredential } from "@/server/credentials/issue";

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
 * passed (core/courses/completion), in whichever order they came. Call it in
 * the transaction that records a passed part; otherwise it says what is missing.
 */
export async function completeCourse(
  tx: Transaction,
  tenant: TenantContext,
  input: { userId: string; courseId: string },
): Promise<CompletionResult> {
  const [course] = await tx
    .select({ completionMode: courses.completionMode })
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
  const missing = missingParts(mode, { workPassed: work.passed, testPassed: test.passed });
  if (missing.length > 0) return { issued: false, missing };
  const issued = await issueCredential(tx, tenant, {
    userId: input.userId,
    courseId: input.courseId,
    basis: mode,
    submissionId: work.submissionId,
    testAttemptId: test.attemptId,
  });
  return { issued: true, ...issued };
}
