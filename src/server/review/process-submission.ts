import { and, eq, ne, sql } from "drizzle-orm";

import type { ValidatedAiReview } from "@/core/review/ai-output";
import { computeAgreement, decideReviewRouting, type AuditReason } from "@/core/review/policy";
import { rubricSchema } from "@/core/review/rubric";
import type { Locale } from "@/core/i18n/locales";
import { localize } from "@/core/i18n/locales";
import type { TenantContext } from "@/core/tenant/context";
import type { Database, Transaction } from "@/db/client";
import { assignments, courses, enrollments, reviews, rubrics, submissions } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import { issueCredential } from "@/server/credentials/issue";
import { trackEvent } from "@/server/events";
import type { LlmCaller } from "@/server/llm";
import { runAiReview, type AiReviewRun } from "@/server/review/run-ai-review";
import {
  readSubmissionFiles,
  reviewText,
  type SubmissionFileContent,
} from "@/server/review/submission-content";

export interface ReviewDeps {
  llm: LlmCaller | null;
  model: string;
}

export type ProcessOutcome =
  | { status: "skipped" }
  | { status: "released"; pass: boolean; percent: number; audit: AuditReason | null }
  | { status: "held"; reasons: string[] };

/** AI passes and AI–human agreement for one assignment: the inputs of the §8 routing rules. */
async function reviewStats(tx: Transaction, assignmentId: string, excludeSubmissionId: string) {
  const [passes] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(reviews)
    .innerJoin(submissions, eq(submissions.id, reviews.submissionId))
    .where(
      and(
        eq(submissions.assignmentId, assignmentId),
        ne(submissions.id, excludeSubmissionId),
        eq(reviews.reviewerType, "ai"),
        sql`(${reviews.overall}->>'pass')::boolean`,
      ),
    );
  const pairs = await tx
    .select({
      ai: sql<
        boolean | null
      >`(select (r.overall->>'pass')::boolean from ${reviews} r where r.submission_id = "submissions"."id" and r.reviewer_type = 'ai' order by r.created_at desc limit 1)`,
      human: sql<
        boolean | null
      >`(select (r.overall->>'pass')::boolean from ${reviews} r where r.submission_id = "submissions"."id" and r.reviewer_type = 'human' order by r.created_at desc limit 1)`,
    })
    .from(submissions)
    .where(eq(submissions.assignmentId, assignmentId));
  return {
    priorAiPasses: passes?.n ?? 0,
    agreement: computeAgreement(
      pairs.flatMap((pair) =>
        pair.ai === null || pair.human === null ? [] : [{ aiPass: pair.ai, humanPass: pair.human }],
      ),
    ),
  };
}

/**
 * The `review.run` job (brief §8). Reads in one transaction, calls the model
 * outside any transaction, then decides and writes in a second one that
 * re-checks the submission, so retries and duplicates are harmless.
 */
export async function processSubmission(
  db: Database,
  input: { tenantId: string; submissionId: string },
  deps: ReviewDeps,
  options: { finalAttempt: boolean } = { finalAttempt: true },
): Promise<ProcessOutcome> {
  const tenant = await findTenantById(db, input.tenantId);
  if (!tenant) return { status: "skipped" };

  const context = await withTenant(db, tenant.id, async (tx) => {
    const [submission] = await tx
      .select()
      .from(submissions)
      .where(eq(submissions.id, input.submissionId));
    if (!submission || submission.status !== "submitted") return null;
    const [assignment] = await tx
      .select()
      .from(assignments)
      .where(eq(assignments.id, submission.assignmentId));
    const [rubricRow] = assignment
      ? await tx.select().from(rubrics).where(eq(rubrics.id, assignment.rubricId))
      : [];
    const [enrollment] = assignment
      ? await tx
          .select({ locale: enrollments.locale })
          .from(enrollments)
          .where(
            and(
              eq(enrollments.courseId, assignment.courseId),
              eq(enrollments.userId, submission.userId),
            ),
          )
      : [];
    if (!assignment || !rubricRow) return null;
    return {
      submission,
      assignment,
      rubricRow,
      locale: (enrollment?.locale ?? tenant.settings.default_locale) as Locale,
      stats: await reviewStats(tx, assignment.id, submission.id),
    };
  });
  if (!context) return { status: "skipped" };

  const rubric = rubricSchema.parse(context.rubricRow.definition);
  const holdReasons: string[] = [];

  let content: SubmissionFileContent = { filesText: context.submission.filesText, images: [] };
  if (context.submission.files.length > 0) {
    try {
      content = await readSubmissionFiles(db, tenant.id, context.submission);
    } catch (error) {
      // Storage trouble: retry; on the last try a human reviews the files directly.
      if (!options.finalAttempt) throw error;
      console.error("[review] reading the submitted files failed", error);
      holdReasons.push("ai_unavailable");
    }
  }
  let review: ValidatedAiReview | null = null;
  let run: AiReviewRun | null = null;

  if (rubric.review_policy.mode === "human_only" || !tenant.settings.features.ai_review) {
    holdReasons.push("human_only");
  } else if (holdReasons.length > 0) {
    // Files could not be read: no AI review on half the work.
  } else if (!deps.llm) {
    holdReasons.push("ai_unavailable");
  } else {
    try {
      const outcome = await runAiReview({
        llm: deps.llm,
        model: deps.model,
        prompt: {
          locale: context.locale,
          tone: tenant.settings.review_tone,
          assignmentPrompt: localize(context.assignment.prompt, context.locale, [
            tenant.settings.default_locale,
          ]),
          artifactName: localize(context.assignment.artifactName, context.locale, [
            tenant.settings.default_locale,
          ]),
          rubric,
          submission: {
            text: reviewText({
              extractedText: context.submission.extractedText,
              filesText: content.filesText,
            }),
            form: context.submission.formData,
            url: context.submission.url,
            imageCount: content.images.length,
          },
        },
        images: content.images,
        metadata: { tenant: tenant.slug, submission: context.submission.id },
      });
      run = outcome;
      if (outcome.ok) review = outcome.review;
      else if (options.finalAttempt) holdReasons.push("ai_invalid_output");
      else throw new Error(`AI review output invalid: ${outcome.errors.join("; ")}`);
    } catch (error) {
      if (!options.finalAttempt) throw error;
      if (!holdReasons.length) holdReasons.push("ai_unavailable");
    }
  }

  return withTenant(db, tenant.id, async (tx) => {
    const [locked] = await tx
      .select({ status: submissions.status })
      .from(submissions)
      .where(eq(submissions.id, context.submission.id))
      .for("update");
    if (locked?.status !== "submitted") return { status: "skipped" };

    const [course] = await tx
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.id, context.assignment.courseId));

    if (!review) {
      await tx
        .update(submissions)
        .set({ status: "in_review" })
        .where(eq(submissions.id, context.submission.id));
      return { status: "held", reasons: holdReasons };
    }

    const routing = decideReviewRouting({
      policy: rubric.review_policy,
      passThreshold: rubric.pass_threshold,
      result: { percent: review.percent, pass: review.pass },
      attemptNo: context.submission.attemptNo,
      submissionId: context.submission.id,
      priorAiPasses: context.stats.priorAiPasses,
      agreement: context.stats.agreement,
    });

    const costUsd = run?.totalCost ?? null;
    await tx.insert(reviews).values({
      tenantId: tenant.id,
      submissionId: context.submission.id,
      reviewerType: "ai",
      criteria: review.criteria,
      overall: { percent: review.percent, pass: review.pass, summary: review.summary },
      routing,
      rubricVersion: context.rubricRow.version,
      model: run?.calls.at(-1)?.model ?? deps.model,
      promptVersion: run?.promptVersion ?? null,
      tokensIn: run ? run.calls.reduce((sum, call) => sum + (call.tokensIn ?? 0), 0) : null,
      tokensOut: run ? run.calls.reduce((sum, call) => sum + (call.tokensOut ?? 0), 0) : null,
      costMicroUsd: costUsd === null ? null : Math.round(costUsd * 1_000_000),
    });

    if (!routing.release) {
      await tx
        .update(submissions)
        .set({ status: "in_review" })
        .where(eq(submissions.id, context.submission.id));
      return { status: "held", reasons: routing.reasons };
    }

    await tx
      .update(submissions)
      .set({ status: review.pass ? "passed" : "needs_revision", decidedAt: new Date() })
      .where(eq(submissions.id, context.submission.id));
    await recordDecision(tx, tenant, {
      userId: context.submission.userId,
      courseId: course!.id,
      submissionId: context.submission.id,
      pass: review.pass,
      locale: context.locale,
    });
    return { status: "released", pass: review.pass, percent: review.percent, audit: routing.audit };
  });
}

/** Events and credential for a released decision. */
export async function recordDecision(
  tx: Transaction,
  tenant: TenantContext,
  input: { userId: string; courseId: string; submissionId: string; pass: boolean; locale: string },
): Promise<void> {
  const base = {
    tenantId: tenant.id,
    userId: input.userId,
    courseId: input.courseId,
    locale: input.locale,
  };
  await trackEvent(tx, { ...base, name: "review_completed", props: { pass: input.pass } });
  if (input.pass) {
    await trackEvent(tx, { ...base, name: "review_passed" });
    await issueCredential(tx, tenant, input);
  }
}
