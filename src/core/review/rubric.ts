import { z } from "zod";

import { localizedTextInputSchema } from "@/core/i18n/locales";

/**
 * Rubric model (brief §4, §8). Scores per criterion are integers described by
 * `score_descriptors` (e.g. 0–3). The overall result is the weighted,
 * normalised score in percent; `pass_threshold` is a percentage too.
 */

export const REVIEW_MODES = ["ai_auto", "ai_then_human", "human_only"] as const;
export type ReviewMode = (typeof REVIEW_MODES)[number];

export const reviewPolicySchema = z.strictObject({
  /**
   * ai_auto: AI result is released at once; humans audit samples.
   * ai_then_human: AI drafts, a human confirms every result before release.
   * human_only: no AI review.
   */
  mode: z.enum(REVIEW_MODES).default("ai_auto"),
  /** Share of AI passes sampled for a human spot check once the initial phase is over. */
  spot_check_rate: z.number().min(0).max(1).default(0.2),
  /** The first N AI passes per course are all spot-checked. */
  initial_full_check_passes: z.number().int().min(0).default(20),
  /** Lower sample rate once AI and humans agree often enough. */
  reduced_spot_check_rate: z.number().min(0).max(1).default(0.1),
  reduce_when_agreement_at_least: z.number().min(0).max(1).default(0.9),
  /** Minimum number of human-checked AI reviews before the agreement rate counts. */
  min_agreement_sample: z.number().int().min(1).default(20),
  escalate_on: z
    .strictObject({
      /** Hold results within ±margin percentage points of the pass threshold; null disables. */
      near_threshold_margin: z.number().min(0).max(50).nullable().default(10),
      /** Hold failed results from this attempt number on; null disables. */
      failed_attempt: z.number().int().min(1).nullable().default(3),
    })
    .prefault({}),
});
export type ReviewPolicy = z.output<typeof reviewPolicySchema>;

const criterionIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, "Criterion ids are short lower-case identifiers");

export const scoreDescriptorSchema = z.strictObject({
  score: z.number().int().min(0).max(10),
  description: localizedTextInputSchema,
});

export const rubricCriterionSchema = z
  .strictObject({
    id: criterionIdSchema,
    label: localizedTextInputSchema,
    description: localizedTextInputSchema,
    weight: z.number().positive().max(100).default(1),
    score_descriptors: z.array(scoreDescriptorSchema).min(2).max(11),
  })
  .superRefine((criterion, ctx) => {
    const scores = criterion.score_descriptors.map((descriptor) => descriptor.score);
    if (new Set(scores).size !== scores.length) {
      ctx.addIssue({
        code: "custom",
        message: `Criterion "${criterion.id}" has duplicate descriptor scores`,
      });
    }
  });
export type RubricCriterion = z.output<typeof rubricCriterionSchema>;

export const exemplarSchema = z.strictObject({
  id: z.string().min(1).max(64),
  /** How the author refers to it, e.g. "Strong brief from the pilot". */
  title: z.string().trim().max(120).optional(),
  /** What the author expects the review to conclude. */
  expected_pass: z.boolean(),
  /** Text of the exemplar (extracted from the uploaded file). */
  content: z.string().min(1).max(40_000),
  expected_scores: z.record(criterionIdSchema, z.number().int().min(0).max(10)).optional(),
  notes: z.string().max(2_000).optional(),
});
export type Exemplar = z.output<typeof exemplarSchema>;

export const rubricSchema = z
  .strictObject({
    criteria: z.array(rubricCriterionSchema).min(1).max(12),
    pass_threshold: z.number().min(0).max(100),
    exemplars: z.array(exemplarSchema).max(10).default([]),
    review_policy: reviewPolicySchema.prefault({}),
  })
  .superRefine((rubric, ctx) => {
    const ids = rubric.criteria.map((criterion) => criterion.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", message: "Criterion ids must be unique" });
    }
  });
export type Rubric = z.output<typeof rubricSchema>;

export function scoreRange(criterion: RubricCriterion): { min: number; max: number } {
  const scores = criterion.score_descriptors.map((descriptor) => descriptor.score);
  return { min: Math.min(...scores), max: Math.max(...scores) };
}

export interface ScoredResult {
  /** Weighted, normalised score in percent (0–100, one decimal). */
  percent: number;
  pass: boolean;
}

/**
 * Computes the overall result from per-criterion scores. We never trust a
 * pass/fail verdict from the model: it is always derived here.
 */
export function scoreRubric(
  rubric: Rubric,
  scores: Readonly<Record<string, number>>,
): ScoredResult {
  let weighted = 0;
  let totalWeight = 0;
  for (const criterion of rubric.criteria) {
    const score = scores[criterion.id];
    if (score === undefined) throw new Error(`Missing score for criterion "${criterion.id}"`);
    const { min, max } = scoreRange(criterion);
    if (score < min || score > max) {
      throw new Error(`Score ${score} for "${criterion.id}" is outside ${min}–${max}`);
    }
    weighted += criterion.weight * ((score - min) / (max - min));
    totalWeight += criterion.weight;
  }
  const percent = Math.round((weighted / totalWeight) * 1000) / 10;
  return { percent, pass: percent >= rubric.pass_threshold };
}
