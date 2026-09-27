import {
  buildInterviewPrompt,
  INTERVIEW_JSON_SCHEMA,
  INTERVIEW_PROMPT_VERSION,
  parseInterviewQuestions,
} from "@/core/authoring/interview";
import { AiAllowanceUsedUp } from "@/core/usage/allowance";
import type { AuthoringModel } from "@/server/authoring/model";

/**
 * Interview questions from the model; null when it does not answer usefully.
 * AiAllowanceUsedUp passes through, so the author learns why the standard
 * questions come instead.
 */
export async function suggestInterviewQuestions(
  model: AuthoringModel,
  input: Parameters<typeof buildInterviewPrompt>[0],
): Promise<string[] | null> {
  const prompt = buildInterviewPrompt(input);
  try {
    const call = await model.llm({
      model: model.model,
      temperature: 0.5,
      maxTokens: 1_000,
      jsonSchema: { ...INTERVIEW_JSON_SCHEMA, schema: { ...INTERVIEW_JSON_SCHEMA.schema } },
      metadata: { purpose: "interview-questions", prompt_version: INTERVIEW_PROMPT_VERSION },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    });
    return parseInterviewQuestions(call.content);
  } catch (error) {
    if (error instanceof AiAllowanceUsedUp) throw error;
    console.warn("[authoring] interview questions failed", error);
    return null;
  }
}
