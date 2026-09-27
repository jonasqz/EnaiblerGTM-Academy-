import { describe, expect, it } from "vitest";

import { rubricSchema } from "@/core/review/rubric";
import type { LlmCallOptions, LlmCallResult } from "@/server/llm";
import { runAiReview } from "@/server/review/run-ai-review";

const rubric = rubricSchema.parse({
  criteria: [
    {
      id: "problem",
      label: "Problem",
      description: "Names a specific problem",
      score_descriptors: [
        { score: 0, description: "Missing" },
        { score: 2, description: "Specific" },
      ],
    },
  ],
  pass_threshold: 50,
});

const prompt = {
  locale: "en" as const,
  tone: "neutral" as const,
  assignmentPrompt: "Write a brief.",
  artifactName: "Idea brief",
  rubric,
  submission: { text: "Founders lose weeks on unvalidated ideas." },
};

function fakeLlm(outputs: string[]) {
  const seen: LlmCallOptions[] = [];
  const llm = async (options: LlmCallOptions): Promise<LlmCallResult> => {
    seen.push(structuredClone(options));
    return {
      content: outputs[seen.length - 1] ?? "",
      model: "fake",
      tokensIn: 1000,
      tokensOut: 200,
      cost: 0.002,
      latencyMs: 5,
    };
  };
  return { llm, seen };
}

const valid = JSON.stringify({
  criteria: [
    {
      criterion_id: "problem",
      score: 2,
      evidence: ["lose weeks on unvalidated ideas"],
      improvement: "Quantify it.",
    },
  ],
  summary: "Clear problem.",
});

describe("runAiReview", () => {
  it("returns a validated review with cost and prompt version", async () => {
    const { llm, seen } = fakeLlm([valid]);
    const outcome = await runAiReview({ llm, model: "review-default", prompt });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.review).toMatchObject({ percent: 100, pass: true, evidenceVerifiedRatio: 1 });
    expect(outcome.promptVersion).toBe("review-v2");
    expect(outcome.totalCost).toBeCloseTo(0.002);
    expect(seen[0]?.temperature).toBeLessThanOrEqual(0.2);
    expect(seen[0]?.jsonSchema?.name).toBe("rubric_review");
    expect(seen[0]?.metadata?.prompt_version).toBe("review-v2");
  });

  it("sends validation errors back and retries", async () => {
    const { llm, seen } = fakeLlm(["not json", valid]);
    const outcome = await runAiReview({ llm, model: "m", prompt });
    expect(outcome.ok).toBe(true);
    expect(outcome.calls).toHaveLength(2);
    const retry = seen[1]?.messages.at(-1)?.content;
    expect(retry).toContain("Output is not valid JSON.");
    expect(outcome.totalCost).toBeCloseTo(0.004);
  });

  it("gives up after maxAttempts", async () => {
    const { llm } = fakeLlm(["{}", "{}", "{}"]);
    const outcome = await runAiReview({ llm, model: "m", prompt, maxAttempts: 2 });
    expect(outcome.ok).toBe(false);
    expect(outcome.calls).toHaveLength(2);
  });

  it("attaches submitted images for vision", async () => {
    const { llm, seen } = fakeLlm([valid]);
    await runAiReview({ llm, model: "m", prompt, images: ["data:image/png;base64,AAAA"] });
    const content = seen[0]?.messages[1]?.content;
    expect(Array.isArray(content) && content[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,AAAA" },
    });
  });
});
