import type { ReviewPolicy } from "@/core/review/rubric";

/**
 * Human-in-the-loop routing (brief §8). Default recommendation, encoded in the
 * policy defaults:
 * - 100 % spot check of the first 20 AI passes per course,
 * - then 20 %, dropping to 10 % once AI–human agreement is ≥ 90 %,
 * - always escalate results within ±10 points of the threshold and failed
 *   results from the third attempt on.
 *
 * Escalations HOLD the result until a human decides. Spot checks are audits:
 * the learner gets the result at once and a reviewer can still override it.
 */

export type HoldReason =
  "human_only" | "policy_requires_human" | "near_threshold" | "repeated_failure";
export type AuditReason = "initial_phase" | "sampled";

export type ReviewRouting =
  { release: true; audit: AuditReason | null } | { release: false; reasons: HoldReason[] };

export interface AgreementStats {
  /** Share of human-checked AI reviews where the human reached the same pass/fail verdict. */
  rate: number;
  sample: number;
}

export interface RoutingInput {
  policy: ReviewPolicy;
  passThreshold: number;
  result: { percent: number; pass: boolean };
  attemptNo: number;
  /** Stable id of the submission; used for deterministic sampling. */
  submissionId: string;
  /** AI passes recorded for this course before this submission. */
  priorAiPasses: number;
  agreement: AgreementStats | null;
}

export function decideReviewRouting(input: RoutingInput): ReviewRouting {
  const { policy, result } = input;

  if (policy.mode === "human_only") return { release: false, reasons: ["human_only"] };

  const reasons: HoldReason[] = [];
  if (policy.mode === "ai_then_human") reasons.push("policy_requires_human");

  const margin = policy.escalate_on.near_threshold_margin;
  if (margin !== null && Math.abs(result.percent - input.passThreshold) <= margin) {
    reasons.push("near_threshold");
  }

  const failedFrom = policy.escalate_on.failed_attempt;
  if (!result.pass && failedFrom !== null && input.attemptNo >= failedFrom) {
    reasons.push("repeated_failure");
  }

  if (reasons.length > 0) return { release: false, reasons };
  if (!result.pass) return { release: true, audit: null };

  if (input.priorAiPasses < policy.initial_full_check_passes) {
    return { release: true, audit: "initial_phase" };
  }
  const rate = spotCheckRate(policy, input.agreement);
  return { release: true, audit: sampleBucket(input.submissionId) < rate ? "sampled" : null };
}

export function spotCheckRate(policy: ReviewPolicy, agreement: AgreementStats | null): number {
  const trusted =
    agreement !== null &&
    agreement.sample >= policy.min_agreement_sample &&
    agreement.rate >= policy.reduce_when_agreement_at_least;
  return trusted ? policy.reduced_spot_check_rate : policy.spot_check_rate;
}

/**
 * Deterministic value in [0, 1) derived from the submission id (FNV-1a), so a
 * retried review job makes the same sampling decision.
 */
export function sampleBucket(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

export function computeAgreement(
  pairs: ReadonlyArray<{ aiPass: boolean; humanPass: boolean }>,
): AgreementStats | null {
  if (pairs.length === 0) return null;
  const agreed = pairs.filter((pair) => pair.aiPass === pair.humanPass).length;
  return { rate: agreed / pairs.length, sample: pairs.length };
}
