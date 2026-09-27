import type { Exemplar, Rubric } from "@/core/review/rubric";

/**
 * Calibration (brief §7, step 5): does the AI judge the author's exemplars
 * the way the author does? Each exemplar is reviewed with the others as
 * examples, never with itself, so the AI cannot simply copy the answer.
 */

/** Below this share of matching verdicts the publish checklist warns. */
export const GOOD_AGREEMENT = 0.8;
/** Calibration needs at least one exemplar of each kind. */
export const MIN_EXEMPLARS = 2;

export interface CalibrationOutcome {
  exemplarId: string;
  expectedPass: boolean;
  aiPass: boolean | null;
  aiScores: Record<string, number>;
  expectedScores?: Record<string, number>;
}

export function rubricWithout(rubric: Rubric, exemplarId: string): Rubric {
  return {
    ...rubric,
    exemplars: rubric.exemplars.filter((exemplar) => exemplar.id !== exemplarId),
  };
}

export function readyToCalibrate(exemplars: readonly Exemplar[]): boolean {
  return (
    exemplars.length >= MIN_EXEMPLARS &&
    exemplars.some((exemplar) => exemplar.expected_pass) &&
    exemplars.some((exemplar) => !exemplar.expected_pass)
  );
}

export interface CalibrationSummary {
  agreed: number;
  total: number;
  /** Null when no exemplar got a valid AI review. */
  agreement: number | null;
  /** Per criterion: mean absolute difference between the author's and the AI's scores. */
  criterionGaps: Array<{ criterionId: string; meanDifference: number; compared: number }>;
}

export function summarizeCalibration(results: readonly CalibrationOutcome[]): CalibrationSummary {
  const reviewed = results.filter((result) => result.aiPass !== null);
  const agreed = reviewed.filter((result) => result.aiPass === result.expectedPass).length;
  const gaps = new Map<string, { sum: number; n: number }>();
  for (const result of reviewed) {
    for (const [criterionId, expected] of Object.entries(result.expectedScores ?? {})) {
      const actual = result.aiScores[criterionId];
      if (actual === undefined) continue;
      const entry = gaps.get(criterionId) ?? { sum: 0, n: 0 };
      entry.sum += Math.abs(actual - expected);
      entry.n += 1;
      gaps.set(criterionId, entry);
    }
  }
  return {
    agreed,
    total: reviewed.length,
    agreement: reviewed.length > 0 ? agreed / reviewed.length : null,
    criterionGaps: [...gaps.entries()]
      .map(([criterionId, { sum, n }]) => ({
        criterionId,
        meanDifference: Math.round((sum / n) * 10) / 10,
        compared: n,
      }))
      .sort((a, b) => b.meanDifference - a.meanDifference),
  };
}

/**
 * The examples a live review sees: a few of each kind is enough to anchor
 * the scale and keeps every review cheap.
 */
export function promptExemplars(exemplars: readonly Exemplar[], perKind = 2): Exemplar[] {
  return [
    ...exemplars.filter((exemplar) => exemplar.expected_pass).slice(0, perKind),
    ...exemplars.filter((exemplar) => !exemplar.expected_pass).slice(0, perKind),
  ];
}
