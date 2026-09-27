import type { Database } from "@/db/client";
import { meteredLlm, type UsageScope } from "@/server/ai-usage";
import { createLlmCaller, type LlmCaller } from "@/server/llm";

export interface AuthoringModel {
  llm: LlmCaller;
  model: string;
}

/** The same model, each call metered for the academy and the work it serves. */
export function meteredModel(
  db: Database,
  model: AuthoringModel,
  scope: UsageScope,
): AuthoringModel {
  return { ...model, llm: meteredLlm(db, model.llm, scope) };
}

/**
 * The model behind the authoring helpers (rubric, questions, lesson drafts,
 * topics). Read by name: the worker uses it too and has no auth secret.
 */
export function authoringModel(timeoutMs = 180_000): AuthoringModel | null {
  const baseUrl = process.env.LLM_BASE_URL?.trim();
  if (!baseUrl) return null;
  return {
    llm: createLlmCaller({
      baseUrl,
      apiKey: process.env.LLM_API_KEY?.trim() || undefined,
      timeoutMs,
    }),
    model:
      process.env.LLM_AUTHORING_MODEL?.trim() ||
      process.env.LLM_REVIEW_MODEL?.trim() ||
      "review-default",
  };
}
