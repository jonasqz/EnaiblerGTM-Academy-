import { z } from "zod";

import { scoreRange, scoreRubric, type Rubric } from "@/core/review/rubric";

/**
 * What the model must return (brief §8): per criterion a score, evidence
 * quoted from the submission and one actionable improvement, plus a short
 * summary. Pass/fail is NOT taken from the model; see `scoreRubric`.
 */

/**
 * Wire schema sent as `response_format` (OpenAI-compatible, via LiteLLM).
 * Structure only: length limits are enforced after parsing, because not every
 * provider supports those keywords in strict mode.
 */
export const AI_REVIEW_JSON_SCHEMA = {
  name: "rubric_review",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["criteria", "summary"],
    properties: {
      criteria: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["criterion_id", "score", "evidence", "improvement"],
          properties: {
            criterion_id: { type: "string" },
            score: { type: "integer" },
            evidence: { type: "array", items: { type: "string" } },
            improvement: { type: "string" },
          },
        },
      },
      summary: { type: "string" },
    },
  },
} as const;

export const aiReviewOutputSchema = z.strictObject({
  criteria: z
    .array(
      z.strictObject({
        criterion_id: z.string().min(1),
        score: z.number().int(),
        evidence: z.array(z.string().trim().min(1).max(500)).max(3),
        improvement: z.string().trim().min(1).max(700),
      }),
    )
    .min(1),
  summary: z.string().trim().min(1).max(1_000),
});
export type AiReviewOutput = z.output<typeof aiReviewOutputSchema>;

export interface ReviewedCriterion {
  criterionId: string;
  score: number;
  feedback: string;
  evidence: Array<{ quote: string; verified: boolean }>;
}

export interface ValidatedAiReview {
  criteria: ReviewedCriterion[];
  summary: string;
  percent: number;
  pass: boolean;
  /** Share of evidence quotes found verbatim (whitespace/case-insensitive) in the submission. */
  evidenceVerifiedRatio: number | null;
}

export type AiReviewValidation =
  { ok: true; review: ValidatedAiReview } | { ok: false; errors: string[] };

function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Parses and checks raw model output against the rubric. Errors are phrased
 * so they can be sent back to the model on retry.
 */
export function validateAiReview(
  raw: unknown,
  rubric: Rubric,
  submissionText: string | null,
): AiReviewValidation {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, errors: ["Output is not valid JSON."] };
    }
  }

  const parsed = aiReviewOutputSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "output"}: ${issue.message}`,
      ),
    };
  }

  const errors: string[] = [];
  const byId = new Map(
    parsed.data.criteria.map((criterion) => [criterion.criterion_id, criterion]),
  );
  if (byId.size !== parsed.data.criteria.length)
    errors.push("Each criterion must appear exactly once.");

  for (const id of byId.keys()) {
    if (!rubric.criteria.some((criterion) => criterion.id === id))
      errors.push(`Unknown criterion_id "${id}".`);
  }

  const scores: Record<string, number> = {};
  for (const criterion of rubric.criteria) {
    const entry = byId.get(criterion.id);
    if (!entry) {
      errors.push(`Missing criterion_id "${criterion.id}".`);
      continue;
    }
    const { min, max } = scoreRange(criterion);
    if (entry.score < min || entry.score > max) {
      errors.push(`Score for "${criterion.id}" must be between ${min} and ${max}.`);
      continue;
    }
    scores[criterion.id] = entry.score;
  }
  if (errors.length > 0) return { ok: false, errors };

  const haystack = submissionText ? normalizeForMatch(submissionText) : null;
  let quotes = 0;
  let verified = 0;
  const criteria: ReviewedCriterion[] = rubric.criteria.map((criterion) => {
    const entry = byId.get(criterion.id)!;
    return {
      criterionId: criterion.id,
      score: entry.score,
      feedback: entry.improvement,
      evidence: entry.evidence.map((quote) => {
        const found = haystack !== null && haystack.includes(normalizeForMatch(quote));
        quotes += 1;
        if (found) verified += 1;
        return { quote, verified: found };
      }),
    };
  });

  const { percent, pass } = scoreRubric(rubric, scores);
  return {
    ok: true,
    review: {
      criteria,
      summary: parsed.data.summary,
      percent,
      pass,
      evidenceVerifiedRatio: haystack === null || quotes === 0 ? null : verified / quotes,
    },
  };
}
