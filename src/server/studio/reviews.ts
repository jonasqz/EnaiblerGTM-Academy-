import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { learnerAlias } from "@/core/people/alias";
import { effectiveOutcome } from "@/core/review/outcome";
import { rubricSchema, scoreRange, scoreRubric } from "@/core/review/rubric";
import type { TenantContext } from "@/core/tenant/context";
import type { Database } from "@/db/client";
import { assignments, courses, enrollments, reviews, rubrics, submissions } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { revokeCredential } from "@/server/credentials/issue";
import { trackEvent } from "@/server/events";
import { recordDecision } from "@/server/review/process-submission";

/*
 * Review queue and overrides (brief §8, author tools). "Decide" holds results
 * the AI may not release on its own; "spot checks" are released AI results
 * sampled for a human look. Every human decision is a new review row; the AI
 * review stays for audit.
 */

export interface QueueRow {
  submissionId: string;
  kind: "decide" | "spot_check";
  courseId: string;
  courseTitle: Record<string, string>;
  alias: string;
  attemptNo: number;
  submittedAt: Date;
  ai: { percent: number; pass: boolean; reasons: string[]; audit: string | null } | null;
}

export async function listReviewQueue(db: Database, tenantId: string): Promise<QueueRow[]> {
  return withTenant(db, tenantId, async (tx) => {
    const rows = await tx
      .select({
        submissionId: submissions.id,
        status: submissions.status,
        userId: submissions.userId,
        attemptNo: submissions.attemptNo,
        submittedAt: submissions.submittedAt,
        courseId: courses.id,
        courseTitle: courses.title,
        hasHuman: sql<boolean>`exists (select 1 from ${reviews} r where r.submission_id = "submissions"."id" and r.reviewer_type = 'human')`,
      })
      .from(submissions)
      .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
      .innerJoin(courses, eq(courses.id, assignments.courseId))
      .orderBy(asc(submissions.submittedAt));
    const aiRows = rows.length
      ? await tx
          .select()
          .from(reviews)
          .where(
            and(
              inArray(
                reviews.submissionId,
                rows.map((row) => row.submissionId),
              ),
              eq(reviews.reviewerType, "ai"),
            ),
          )
          .orderBy(desc(reviews.createdAt))
      : [];

    const queue: QueueRow[] = [];
    for (const row of rows) {
      const ai = aiRows.find((review) => review.submissionId === row.submissionId);
      const routing = ai?.routing;
      const held = row.status === "in_review";
      const audit =
        !held && !row.hasHuman && routing?.release === true && routing.audit !== null
          ? routing.audit
          : null;
      if (!held && !audit) continue;
      queue.push({
        submissionId: row.submissionId,
        kind: held ? "decide" : "spot_check",
        courseId: row.courseId,
        courseTitle: row.courseTitle,
        alias: learnerAlias(tenantId, row.userId),
        attemptNo: row.attemptNo,
        submittedAt: row.submittedAt,
        ai: ai
          ? {
              percent: ai.overall.percent,
              pass: ai.overall.pass,
              reasons: routing && !routing.release ? routing.reasons : [],
              audit,
            }
          : null,
      });
    }
    return queue.sort((a, b) => Number(a.kind === "spot_check") - Number(b.kind === "spot_check"));
  });
}

/** Results held for a human decision (the Studio nav badge). */
export async function countHeldSubmissions(db: Database, tenantId: string): Promise<number> {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(submissions)
      .where(eq(submissions.status, "in_review")),
  );
  return row?.n ?? 0;
}

export async function loadReviewDetail(db: Database, tenantId: string, submissionId: string) {
  return withTenant(db, tenantId, async (tx) => {
    const [submission] = await tx
      .select()
      .from(submissions)
      .where(eq(submissions.id, submissionId));
    if (!submission) return null;
    const [assignment] = await tx
      .select()
      .from(assignments)
      .where(eq(assignments.id, submission.assignmentId));
    const [course] = await tx.select().from(courses).where(eq(courses.id, assignment!.courseId));
    const [rubricRow] = await tx.select().from(rubrics).where(eq(rubrics.id, assignment!.rubricId));
    const history = await tx
      .select()
      .from(reviews)
      .where(eq(reviews.submissionId, submissionId))
      .orderBy(desc(reviews.createdAt));
    const [enrollment] = await tx
      .select({ locale: enrollments.locale })
      .from(enrollments)
      .where(and(eq(enrollments.courseId, course!.id), eq(enrollments.userId, submission.userId)));
    return {
      submission,
      assignment: assignment!,
      course: course!,
      rubric: rubricSchema.parse(rubricRow!.definition),
      rubricVersion: rubricRow!.version,
      reviews: history,
      alias: learnerAlias(tenantId, submission.userId),
      locale: enrollment?.locale ?? "en",
    };
  });
}

export interface DecisionInput {
  scores: Record<string, number>;
  feedback: Record<string, string>;
  summary: string;
  /** Required when the human reaches a different verdict than the AI. */
  reason: string | null;
}

export type DecisionResult =
  { ok: true; pass: boolean; overridden: boolean } | { ok: false; error: string };

export async function decideSubmission(
  db: Database,
  tenant: TenantContext,
  reviewerId: string,
  submissionId: string,
  input: DecisionInput,
): Promise<DecisionResult> {
  return withTenant(db, tenant.id, async (tx) => {
    const [submission] = await tx
      .select()
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .for("update");
    if (!submission) return { ok: false, error: "not_found" };
    const [assignment] = await tx
      .select()
      .from(assignments)
      .where(eq(assignments.id, submission.assignmentId));
    const [rubricRow] = await tx.select().from(rubrics).where(eq(rubrics.id, assignment!.rubricId));
    const rubric = rubricSchema.parse(rubricRow!.definition);

    for (const criterion of rubric.criteria) {
      const score = input.scores[criterion.id];
      const { min, max } = scoreRange(criterion);
      if (score === undefined || !Number.isInteger(score) || score < min || score > max) {
        return { ok: false, error: `score:${criterion.id}` };
      }
    }
    const { percent, pass } = scoreRubric(rubric, input.scores);

    const history = await tx
      .select()
      .from(reviews)
      .where(eq(reviews.submissionId, submissionId))
      .orderBy(desc(reviews.createdAt));
    const ai = history.find((review) => review.reviewerType === "ai");
    const lastHuman = history.find((review) => review.reviewerType === "human");
    const disagreesWithAi = ai !== undefined && ai.overall.pass !== pass;
    if (disagreesWithAi && !input.reason?.trim()) return { ok: false, error: "reason_required" };

    const before = effectiveOutcome(submission.status, lastHuman ? lastHuman.overall.pass : null);
    const released = before !== "pending";
    const reverses = released && (before === "passed") !== pass;
    const status = !released
      ? pass
        ? "passed"
        : "needs_revision"
      : reverses
        ? "overridden"
        : submission.status;

    await tx.insert(reviews).values({
      tenantId: tenant.id,
      submissionId,
      reviewerType: "human",
      reviewerUserId: reviewerId,
      criteria: rubric.criteria.map((criterion) => ({
        criterionId: criterion.id,
        score: input.scores[criterion.id]!,
        feedback: input.feedback[criterion.id]?.trim() ?? "",
        evidence: [],
      })),
      overall: { percent, pass, summary: input.summary.trim() },
      rubricVersion: rubricRow!.version,
      overridesReviewId: disagreesWithAi ? ai!.id : null,
      overrideReason: input.reason?.trim() || null,
    });
    await tx
      .update(submissions)
      .set({ status, decidedAt: new Date() })
      .where(eq(submissions.id, submissionId));

    const [enrollment] = await tx
      .select({ locale: enrollments.locale })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.courseId, assignment!.courseId),
          eq(enrollments.userId, submission.userId),
        ),
      );
    const locale = enrollment?.locale ?? tenant.settings.default_locale;
    if (disagreesWithAi) {
      await trackEvent(tx, {
        tenantId: tenant.id,
        name: "review_overridden",
        userId: submission.userId,
        courseId: assignment!.courseId,
        locale,
        props: { aiPass: ai!.overall.pass, humanPass: pass },
      });
    }
    if (!released || reverses) {
      if (reverses && !pass) {
        await revokeCredential(tx, {
          userId: submission.userId,
          courseId: assignment!.courseId,
          reason: "override",
        });
      }
      await recordDecision(tx, tenant, {
        userId: submission.userId,
        courseId: assignment!.courseId,
        submissionId,
        pass,
        locale,
      });
    }
    return { ok: true, pass, overridden: disagreesWithAi };
  });
}
