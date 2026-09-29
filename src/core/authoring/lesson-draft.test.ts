import { describe, expect, it } from "vitest";

import {
  buildLessonDraftPrompt,
  LESSON_DRAFT_JSON_SCHEMA,
  parseLessonDraft,
  takeawaysMarkdown,
} from "@/core/authoring/lesson-draft";

const lesson = (overrides: Record<string, unknown> = {}) => ({
  title: "The first reminder",
  criterion_ids: ["timing"],
  markdown:
    "## Why it matters\n\nMost clients simply forgot. A friendly nudge three days after the due date gets most invoices paid.",
  source_refs: ["S1", "S2"],
  ...overrides,
});

const known = {
  criterionIds: ["timing"],
  sourceRefs: ["S1", "S2", "S3"],
  keyframeRefs: [],
  chapterRefs: ["S1", "S2"],
};

describe("key takeaways per chapter", () => {
  it("asks for takeaways of recording chapters and for the outline's order", () => {
    const prompt = buildLessonDraftPrompt({
      locale: "en",
      artifactName: "Reminder playbook",
      assignmentPrompt: "Write your reminders.",
      criteria: [{ id: "timing", label: "Timing", description: "Each reminder has a date." }],
      existingLessons: [],
      passages: [
        {
          ref: "S1",
          source: "Webinar 1 · The first reminder (1:00–6:40)",
          text: "Three days.",
          chapter: true,
        },
        { ref: "S2", source: "Playbook", text: "Fees." },
      ],
      outline: [{ title: "Reminders", refs: ["S1"] }],
      maxLessons: 6,
      nonce: "n",
    });
    expect(prompt.system).toContain('passages marked "chapter"');
    expect(prompt.system).toContain("follow the outline's order");
    expect(prompt.user).toContain("## S1 · Webinar 1 · The first reminder (1:00–6:40) · chapter");
    expect(prompt.user).toContain("## S2 · Playbook\n");
    expect(prompt.user).toContain(
      "# Outline of the merged recordings (follow this order)\n1. Reminders: S1",
    );
    expect(LESSON_DRAFT_JSON_SCHEMA.schema.properties.lessons.items.required).toContain(
      "takeaways",
    );
  });

  it("keeps takeaways of known chapters only, cleaned and within limits", () => {
    const result = parseLessonDraft(
      JSON.stringify({
        lessons: [
          lesson({
            takeaways: [
              {
                source_ref: "S1",
                points: ["- Remind three days after the due date.", " ", "<b>Be</b> friendly."],
              },
              { source_ref: "S1", points: ["Twice?"] },
              { source_ref: "S3", points: ["Not a chapter."] },
              { source_ref: "S2", points: ["One", "Two", "Three", "Four", "Five"] },
            ],
          }),
        ],
        notes: [],
      }),
      known,
      6,
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.lessons[0]!.takeaways).toEqual([
      { ref: "S1", points: ["Remind three days after the due date.", "Be friendly."] },
      { ref: "S2", points: ["One", "Two", "Three", "Four"] },
    ]);
  });

  it("takes lessons without takeaways from gateways that leave them out", () => {
    const result = parseLessonDraft(JSON.stringify({ lessons: [lesson()], notes: [] }), known, 6);
    expect(result.ok && result.lessons[0]!.takeaways).toEqual([]);
  });

  it("writes the section with each chapter's name and time, in the lesson's language", () => {
    expect(
      takeawaysMarkdown("de", [
        {
          label: "Webinar 1 · Die erste Erinnerung (1:00–6:40)",
          points: ["Drei Tage.", "Freundlich."],
        },
        { label: "Webinar 2 · *Gebühren* (0:00–2:00)", points: ["40 Euro."] },
      ]),
    ).toBe(
      "## Das Wichtigste\n\n**Webinar 1 · Die erste Erinnerung (1:00–6:40)**\n\n- Drei Tage.\n- Freundlich.\n\n**Webinar 2 · Gebühren (0:00–2:00)**\n\n- 40 Euro.",
    );
    expect(takeawaysMarkdown("en", [])).toBe("");
  });
});
