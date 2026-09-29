import { describe, expect, it } from "vitest";

import {
  assignmentDraftJsonSchema,
  buildAssignmentDraftPrompt,
  parseAssignmentDraft,
} from "@/core/authoring/assignment-draft";

const both = (en: string, de: string) => ({ en, de });

const level = (score: number) => ({
  score,
  description: both(`Level ${score}`, `Stufe ${score}`),
});

const answer = (overrides: Record<string, unknown> = {}) => ({
  artifact_name: both("Reminder playbook", "Mahnplan"),
  prompt: both(
    "Write the reminder sequence you will send for late invoices: three reminders with dates and wording.",
    "Schreib die Erinnerungen, die du bei offenen Rechnungen verschickst: drei Stufen mit Datum und Text.",
  ),
  criteria: [
    {
      label: both("Timing", "Zeitpunkt"),
      description: both("Each reminder has a date.", "Jede Erinnerung hat ein Datum."),
      weight: 2,
      levels: [0, 1, 2, 3].map(level),
    },
    {
      label: both("Tone", "Ton"),
      description: both("Friendly, then firm.", "Erst freundlich, dann bestimmt."),
      weight: 1,
      levels: [0, 1, 2, 3].map(level),
    },
    {
      label: both("Fees", "Gebühren"),
      description: both("Names the flat fee.", "Nennt die Pauschale."),
      weight: 1,
      levels: [0, 1, 2, 3].map(level),
    },
  ],
  pass_threshold: 65,
  notes: ["The sources say little about clients abroad."],
  ...overrides,
});

describe("the assignment and rubric drafted from sources", () => {
  it("asks for real work the sources teach, in every course language", () => {
    const prompt = buildAssignmentDraftPrompt({
      languages: ["en", "de"],
      courseTitle: "Get paid on time",
      current: { artifactName: "", prompt: "Something about reminders" },
      sections: [
        { ref: "C1", label: "Webinar · Fees (2:10–5:00)", text: "A flat fee of 40 euros." },
      ],
      nonce: "n",
    });
    expect(prompt.system).toContain("never a summary of the sources or a quiz");
    expect(prompt.system).toContain("English and German");
    expect(prompt.system).toContain("Write 3 to 6 criteria");
    expect(prompt.user).toContain("Assignment: Something about reminders");
    expect(prompt.user).toContain("## C1 · Webinar · Fees (2:10–5:00)");
    expect(assignmentDraftJsonSchema(["de"]).schema.required).toContain("artifact_name");
  });

  it("turns a complete answer into name, assignment and a valid rubric", () => {
    const result = parseAssignmentDraft(JSON.stringify(answer()), ["en", "de"]);
    expect(result).toMatchObject({
      ok: true,
      artifactName: both("Reminder playbook", "Mahnplan"),
      rubric: { pass_threshold: 65 },
      notes: ["The sources say little about clients abroad."],
    });
    expect(result.ok && result.rubric.criteria.map((criterion) => criterion.id)).toEqual([
      "timing",
      "tone",
      "fees",
    ]);
  });

  it("refuses missing languages and a name no credential may carry", () => {
    expect(
      parseAssignmentDraft(JSON.stringify(answer({ prompt: { en: "Only English." } })), [
        "en",
        "de",
      ]),
    ).toMatchObject({ ok: false });
    expect(
      parseAssignmentDraft(
        JSON.stringify(answer({ artifact_name: both("Certified reminder plan", "Mahnplan") })),
        ["en", "de"],
      ),
    ).toMatchObject({ ok: false });
    expect(parseAssignmentDraft("nope", ["en"])).toMatchObject({ ok: false });
  });
});
