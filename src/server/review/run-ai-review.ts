import {
  AI_REVIEW_JSON_SCHEMA,
  validateAiReview,
  type ValidatedAiReview,
} from "@/core/review/ai-output";
import { buildReviewPrompt, type ReviewPromptInput } from "@/core/review/prompt";
import type { ChatContentPart, ChatMessage, LlmCaller, LlmCallResult } from "@/server/llm";

export interface AiReviewRun {
  promptVersion: string;
  calls: LlmCallResult[];
  /** Sum over all calls, including invalid attempts; null if any call had no price. */
  totalCost: number | null;
}

export type AiReviewOutcome =
  | ({ ok: true; review: ValidatedAiReview } & AiReviewRun)
  | ({ ok: false; errors: string[] } & AiReviewRun);

/**
 * Runs the rubric review (brief §8): fixed, versioned prompt; low temperature;
 * schema-validated output with retry. Invalid output is sent back to the model
 * with the validation errors, up to `maxAttempts` calls in total.
 */
export async function runAiReview(options: {
  llm: LlmCaller;
  model: string;
  prompt: Omit<ReviewPromptInput, "nonce">;
  /** Data URLs of submitted images, sent via vision. */
  images?: string[];
  maxAttempts?: number;
  metadata?: Record<string, string>;
}): Promise<AiReviewOutcome> {
  const prompt = buildReviewPrompt({ ...options.prompt, nonce: crypto.randomUUID() });
  const userContent: ChatContentPart[] = [
    { type: "text", text: prompt.user },
    ...(options.images ?? []).map((url) => ({ type: "image_url" as const, image_url: { url } })),
  ];
  const messages: ChatMessage[] = [
    { role: "system", content: prompt.system },
    { role: "user", content: userContent.length === 1 ? prompt.user : userContent },
  ];

  const calls: LlmCallResult[] = [];
  const summary = (): AiReviewRun => ({
    promptVersion: prompt.version,
    calls,
    totalCost: calls.some((call) => call.cost === null)
      ? null
      : calls.reduce((sum, call) => sum + (call.cost ?? 0), 0),
  });

  let errors: string[] = [];
  for (let attempt = 0; attempt < (options.maxAttempts ?? 3); attempt++) {
    const call = await options.llm({
      model: options.model,
      messages,
      temperature: 0.1,
      jsonSchema: { ...AI_REVIEW_JSON_SCHEMA, schema: { ...AI_REVIEW_JSON_SCHEMA.schema } },
      metadata: { prompt_version: prompt.version, ...options.metadata },
    });
    calls.push(call);

    const result = validateAiReview(
      call.content,
      options.prompt.rubric,
      options.prompt.submission.text ?? null,
    );
    if (result.ok) return { ok: true, review: result.review, ...summary() };

    errors = result.errors;
    messages.push(
      { role: "assistant", content: call.content },
      {
        role: "user",
        content: `Your output was invalid:\n- ${errors.join("\n- ")}\nReturn the complete corrected JSON only.`,
      },
    );
  }
  return { ok: false, errors, ...summary() };
}
