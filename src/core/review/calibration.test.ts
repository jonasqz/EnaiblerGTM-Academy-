import { describe, expect, it } from "vitest";

import {
  promptExemplars,
  readyToCalibrate,
  rubricWithout,
  summarizeCalibration,
} from "@/core/review/calibration";
import { buildReviewPrompt } from "@/core/review/prompt";
import { rubricSchema, type Exemplar } from "@/core/review/rubric";

const exemplar = (id: string, pass: boolean): Exemplar => ({
  id,
  expected_pass: pass,
  content: `Exemplar ${id}`,
});

const rubric = rubricSchema.parse({
  criteria: [
    {
      id: "evidence",
      label: { en: "Evidence" },
      description: { en: "Claims are backed" },
      score_descriptors: [
        { score: 0, description: { en: "None" } },
        { score: 3, description: { en: "Strong" } },
      ],
    },
  ],
  pass_threshold: 60,
  exemplars: [exemplar("a", true), exemplar("b", false), exemplar("c", true), exemplar("d", true)],
});

describe("calibration", () => {
  it("needs a passing and a failing exemplar", () => {
    expect(readyToCalibrate([exemplar("a", true), exemplar("b", true)])).toBe(false);
    expect(readyToCalibrate([exemplar("a", true), exemplar("b", false)])).toBe(true);
  });

  it("reviews an exemplar without showing it to the AI as an example", () => {
    expect(rubricWithout(rubric, "a").exemplars.map((e) => e.id)).toEqual(["b", "c", "d"]);
    const prompt = buildReviewPrompt({
      locale: "en",
      tone: "neutral",
      assignmentPrompt: "Write a brief.",
      artifactName: "Brief",
      rubric: rubricWithout(rubric, "a"),
      submission: { text: "Exemplar a" },
      nonce: "n",
      includeExemplars: true,
    });
    expect(prompt.user).not.toContain("Exemplar a\n\n## Example");
    expect(prompt.user.match(/## Example \d/g)).toHaveLength(3);
  });

  it("gives live reviews at most two examples of each kind", () => {
    expect(promptExemplars(rubric.exemplars).map((e) => e.id)).toEqual(["a", "c", "b"]);
  });

  it("measures agreement on verdicts and the gap per criterion", () => {
    const summary = summarizeCalibration([
      {
        exemplarId: "a",
        expectedPass: true,
        aiPass: true,
        aiScores: { evidence: 3 },
        expectedScores: { evidence: 3 },
      },
      {
        exemplarId: "b",
        expectedPass: false,
        aiPass: true,
        aiScores: { evidence: 2 },
        expectedScores: { evidence: 0 },
      },
      { exemplarId: "c", expectedPass: true, aiPass: null, aiScores: {} },
    ]);
    expect(summary).toMatchObject({ agreed: 1, total: 2, agreement: 0.5 });
    expect(summary.criterionGaps).toEqual([
      { criterionId: "evidence", meanDifference: 1, compared: 2 },
    ]);
    expect(summarizeCalibration([]).agreement).toBeNull();
  });
});
