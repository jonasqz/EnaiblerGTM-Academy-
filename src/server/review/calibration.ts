import { desc, eq } from "drizzle-orm";

import { readyToCalibrate, rubricWithout, summarizeCalibration } from "@/core/review/calibration";
import { REVIEW_PROMPT_VERSION } from "@/core/review/prompt";
import { rubricSchema } from "@/core/review/rubric";
import { localize, type Locale } from "@/core/i18n/locales";
import type { Database } from "@/db/client";
import { assignments, calibrationRuns, courses, rubrics } from "@/db/schema";
import type { CalibrationResult } from "@/db/schema/authoring";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import type { Enqueue } from "@/server/jobs/producer";
import { QUEUES } from "@/server/jobs/queues";
import type { LlmCaller } from "@/server/llm";
import { runAiReview } from "@/server/review/run-ai-review";

export type CalibrationRun = typeof calibrationRuns.$inferSelect;

export async function requestCalibration(
  db: Database,
  tenantId: string,
  input: { courseId: string; requestedBy: string },
  enqueue: Enqueue,
): Promise<string | null> {
  return withTenant(db, tenantId, async (tx) => {
    const [row] = await tx
      .select({ version: rubrics.version, definition: rubrics.definition })
      .from(assignments)
      .innerJoin(rubrics, eq(rubrics.id, assignments.rubricId))
      .where(eq(assignments.courseId, input.courseId));
    if (!row || !readyToCalibrate(rubricSchema.parse(row.definition).exemplars)) return null;
    const [run] = await tx
      .insert(calibrationRuns)
      .values({
        tenantId,
        courseId: input.courseId,
        rubricVersion: row.version,
        requestedBy: input.requestedBy,
      })
      .returning({ id: calibrationRuns.id });
    await enqueue(tx, QUEUES.calibration, { tenantId, runId: run!.id }, { id: run!.id });
    return run!.id;
  });
}

export async function listCalibrationRuns(
  db: Database,
  tenantId: string,
  courseId: string,
  limit = 5,
): Promise<CalibrationRun[]> {
  return withTenant(db, tenantId, (tx) =>
    tx
      .select()
      .from(calibrationRuns)
      .where(eq(calibrationRuns.courseId, courseId))
      .orderBy(desc(calibrationRuns.createdAt))
      .limit(limit),
  );
}

/** The `calibration.run` job: every exemplar through the same review as real work. */
export async function runCalibration(
  db: Database,
  tenantId: string,
  runId: string,
  deps: { llm: LlmCaller | null; model: string; finalAttempt: boolean },
): Promise<void> {
  const tenant = await findTenantById(db, tenantId);
  const context = await withTenant(db, tenantId, async (tx) => {
    const [run] = await tx.select().from(calibrationRuns).where(eq(calibrationRuns.id, runId));
    if (!run || run.status === "done") return null;
    const [course] = await tx.select().from(courses).where(eq(courses.id, run.courseId));
    const [assignment] = await tx
      .select()
      .from(assignments)
      .where(eq(assignments.courseId, run.courseId));
    const [rubricRow] = assignment
      ? await tx.select().from(rubrics).where(eq(rubrics.id, assignment.rubricId))
      : [];
    return course && assignment && rubricRow ? { run, course, assignment, rubricRow } : null;
  });
  if (!tenant || !context) return;
  const finish = (values: Partial<CalibrationRun>) =>
    withTenant(db, tenantId, (tx) =>
      tx
        .update(calibrationRuns)
        .set({ ...values, finishedAt: new Date() })
        .where(eq(calibrationRuns.id, runId)),
    );
  if (!deps.llm) {
    await finish({ status: "failed", error: "gateway_missing" });
    return;
  }
  await withTenant(db, tenantId, (tx) =>
    tx.update(calibrationRuns).set({ status: "running" }).where(eq(calibrationRuns.id, runId)),
  );

  const rubric = rubricSchema.parse(context.rubricRow.definition);
  const locale = (context.course.languages[0] ?? tenant.settings.default_locale) as Locale;
  const fallback = [tenant.settings.default_locale];
  const results: CalibrationResult[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let cost: number | null = 0;
  try {
    for (const exemplar of rubric.exemplars) {
      const base: CalibrationResult = {
        exemplarId: exemplar.id,
        title: exemplar.title ?? exemplar.content.split("\n")[0]!.slice(0, 80),
        expectedPass: exemplar.expected_pass,
        aiPass: null,
        aiPercent: null,
        aiScores: {},
        ...(exemplar.expected_scores ? { expectedScores: exemplar.expected_scores } : {}),
      };
      const outcome = await runAiReview({
        llm: deps.llm,
        model: deps.model,
        prompt: {
          locale,
          tone: tenant.settings.review_tone,
          assignmentPrompt: localize(context.assignment.prompt, locale, fallback),
          artifactName: localize(context.assignment.artifactName, locale, fallback),
          rubric: rubricWithout(rubric, exemplar.id),
          includeExemplars: true,
          submission: { text: exemplar.content },
        },
        metadata: { tenant: tenant.slug, purpose: "calibration", exemplar: exemplar.id },
      });
      for (const call of outcome.calls) {
        tokensIn += call.tokensIn ?? 0;
        tokensOut += call.tokensOut ?? 0;
        cost = cost === null || call.cost === null ? null : cost + call.cost;
      }
      results.push(
        outcome.ok
          ? {
              ...base,
              aiPass: outcome.review.pass,
              aiPercent: outcome.review.percent,
              aiScores: Object.fromEntries(
                outcome.review.criteria.map((criterion) => [
                  criterion.criterionId,
                  criterion.score,
                ]),
              ),
              summary: outcome.review.summary,
            }
          : { ...base, error: "invalid_review" },
      );
    }
  } catch (error) {
    if (!deps.finalAttempt) throw error;
    await finish({ status: "failed", error: "gateway_failed" });
    return;
  }
  const summary = summarizeCalibration(results);
  await finish({
    status: "done",
    results,
    agreement: summary.agreement,
    model: deps.model,
    promptVersion: REVIEW_PROMPT_VERSION,
    tokensIn,
    tokensOut,
    costMicroUsd: cost === null ? null : Math.round(cost * 1_000_000),
  });
}
