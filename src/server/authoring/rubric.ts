import { randomUUID } from "node:crypto";

import {
  buildRubricDraftPrompt,
  parseRubricDraft,
  RUBRIC_DRAFT_PROMPT_VERSION,
  rubricDraftJsonSchema,
  type RubricDraftInput,
  type RubricDraftResult,
} from "@/core/authoring/rubric-draft";
import type { AuthoringModel } from "@/server/authoring/model";

/** Drafts a rubric; an invalid answer gets one more try before giving up. */
export async function draftRubric(
  model: AuthoringModel,
  input: Omit<RubricDraftInput, "nonce">,
  metadata: Record<string, string> = {},
): Promise<RubricDraftResult> {
  const prompt = buildRubricDraftPrompt({ ...input, nonce: randomUUID() });
  let last: RubricDraftResult = { ok: false, errors: ["No answer"] };
  for (let attempt = 0; attempt < 2; attempt++) {
    const call = await model.llm({
      model: model.model,
      temperature: 0.3,
      maxTokens: 4_000,
      jsonSchema: rubricDraftJsonSchema(input.languages),
      metadata: {
        purpose: "rubric-draft",
        prompt_version: RUBRIC_DRAFT_PROMPT_VERSION,
        ...metadata,
      },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    });
    last = parseRubricDraft(call.content, input.languages);
    if (last.ok) return last;
  }
  return last;
}
