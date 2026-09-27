import { describe, expect, it } from "vitest";

import { checkIssueText } from "@/core/i18n/studio/helpers";
import { studioText } from "@/core/i18n/studio/translator";
import {
  checkIssuesOf,
  checkOutcome,
  cleanCheckQuestions,
  moveItem,
  newCheckQuestion,
  parseCheckQuestions,
  previewCheckQuestions,
  toggleChoice,
  unusedId,
} from "@/core/questions/knowledge-check";
import { checkQuestionsSchema, type CheckQuestion } from "@/core/questions/questions";

const lateFee: CheckQuestion = {
  id: "q1",
  prompt: "What may you charge a business client who pays late?",
  options: [
    { id: "a", text: "Nothing" },
    { id: "b", text: "A flat fee of 40 euros" },
    { id: "c", text: "Interest" },
  ],
  correct: ["b", "c"],
  explanation: "Both: the flat fee and interest on top of the base rate.",
};

const reminder: CheckQuestion = {
  id: "q2",
  prompt: "When does the first reminder go out?",
  options: [
    { id: "a", text: "After a week" },
    { id: "b", text: "After a year" },
  ],
  correct: ["a"],
};

/** Ids in a fixed order, so tests can name them. */
function sequence(...ids: string[]) {
  let next = 0;
  return () => ids[next++] ?? `id${next}`;
}

describe("saving a knowledge check", () => {
  it("spells the same content one way", () => {
    const messy: CheckQuestion = {
      ...lateFee,
      prompt: `  ${lateFee.prompt} `,
      options: lateFee.options.map((option) => ({ ...option, text: `${option.text} ` })),
      correct: ["c", "b"],
      explanation: "   ",
    };
    const [clean] = cleanCheckQuestions([messy]);
    expect(clean).toEqual({ ...lateFee, explanation: undefined, correct: ["b", "c"] });
    expect(clean).not.toHaveProperty("explanation");
    expect(cleanCheckQuestions([lateFee, reminder])).toEqual([lateFee, reminder]);
  });

  it("reads what the editor sends and cleans it", () => {
    const parsed = parseCheckQuestions(JSON.stringify([{ ...reminder, explanation: "" }]));
    expect(parsed).toEqual({ ok: true, questions: [reminder] });
    expect(parseCheckQuestions("[]")).toEqual({ ok: true, questions: [] });
  });

  it("refuses what cannot be a knowledge check, and says where", () => {
    expect(parseCheckQuestions("{")).toEqual({ ok: false, issues: [{ code: "unreadable" }] });
    expect(parseCheckQuestions(JSON.stringify({ questions: [] }))).toEqual({
      ok: false,
      issues: [{ code: "unreadable" }],
    });

    const broken = [
      reminder,
      {
        ...lateFee,
        prompt: " ",
        options: [
          { id: "a", text: "" },
          { id: "b", text: "x".repeat(201) },
          { id: "c", text: " " },
        ],
        correct: [],
        explanation: "y".repeat(1001),
      },
      { ...reminder, id: "q3", options: [{ id: "a", text: "Only one" }] },
    ];
    const parsed = parseCheckQuestions(JSON.stringify(broken));
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? [] : parsed.issues).toEqual([
      { code: "prompt_missing", question: 2 },
      { code: "option_missing", question: 2, option: 1 },
      { code: "option_long", question: 2, option: 2, max: 200 },
      { code: "option_missing", question: 2, option: 3 },
      { code: "no_right_answer", question: 2 },
      { code: "explanation_long", question: 2, max: 1000 },
      { code: "options_few", question: 3, min: 2 },
    ]);
  });

  it("counts too many questions and answers, and treats broken ids as a stale form", () => {
    const eleven = Array.from({ length: 11 }, (_, index) => ({ ...reminder, id: `q${index}` }));
    const many = parseCheckQuestions(JSON.stringify(eleven));
    expect(many.ok ? [] : many.issues).toEqual([{ code: "too_many", max: 10 }]);

    const seven = Array.from({ length: 7 }, (_, index) => ({ id: `o${index}`, text: "Yes" }));
    const crowded = parseCheckQuestions(
      JSON.stringify([{ ...reminder, options: seven, correct: ["o0"] }]),
    );
    expect(crowded.ok ? [] : crowded.issues).toEqual([
      { code: "options_many", question: 1, max: 6 },
    ]);

    for (const tampered of [
      [reminder, reminder],
      [{ ...reminder, correct: ["z"] }],
      [{ ...reminder, id: "no spaces" }],
      [{ ...reminder, points: 3 }],
    ]) {
      const parsed = parseCheckQuestions(JSON.stringify(tampered));
      expect(parsed.ok ? [] : parsed.issues).toEqual([{ code: "unreadable" }]);
    }
  });

  it("maps the schema's own findings, each once", () => {
    const result = checkQuestionsSchema.safeParse([{ ...reminder, prompt: "" }]);
    expect(result.success).toBe(false);
    const issues = result.error!.issues;
    expect(checkIssuesOf([...issues, ...issues])).toEqual([
      { code: "prompt_missing", question: 1 },
    ]);
  });

  it("words every problem for the Studio, in the team member's language", () => {
    const de = studioText("de");
    expect(checkIssueText(de, { code: "option_missing", question: 2, option: 3 })).toBe(
      "Frage 2: Antwort 3 ist leer.",
    );
    expect(checkIssueText(de, { code: "explanation_long", question: 1, max: 1000 })).toBe(
      "Frage 1: Die Erklärung ist zu lang (höchstens 1.000 Zeichen).",
    );
    expect(checkIssueText(studioText("en"), { code: "options_few", question: 4, min: 2 })).toBe(
      "Question 4 needs at least 2 answers.",
    );
    const codes = [
      "unreadable",
      "too_many",
      "prompt_missing",
      "prompt_long",
      "options_few",
      "options_many",
      "option_missing",
      "option_long",
      "no_right_answer",
      "explanation_long",
    ] as const;
    for (const t of [de, studioText("en")]) {
      for (const code of codes) {
        const text = checkIssueText(t, { code, question: 1, option: 1, min: 2, max: 10 });
        expect(text, code).not.toMatch(/[{}]/);
      }
    }
  });
});

describe("editing a knowledge check", () => {
  it("starts a question blank, with the fewest answers allowed and fresh ids", () => {
    expect(newCheckQuestion([reminder], sequence("q2", "a", "x"))).toEqual({
      id: "q2-2",
      prompt: "",
      options: [
        { id: "a-2", text: "" },
        { id: "x", text: "" },
      ],
      correct: [],
    });
  });

  it("never hands out an id twice", () => {
    expect(unusedId(() => "a", new Set(["a", "a-2"]))).toBe("a-3");
    expect(unusedId(() => "b", new Set(["a"]))).toBe("b");
  });

  it("moves questions one place, and not past either end", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });

  it("previews only what has been written so far", () => {
    const draft: CheckQuestion[] = [
      { ...lateFee, options: [...lateFee.options, { id: "d", text: " " }], correct: ["c", "d"] },
      { ...reminder, prompt: "" },
      { id: "q3", prompt: "Half done", options: [{ id: "a", text: "" }], correct: [] },
    ];
    expect(previewCheckQuestions(draft)).toEqual([{ ...lateFee, correct: ["c"] }]);
  });
});

describe("answering a knowledge check", () => {
  it("tells right, wrong and unanswered apart", () => {
    expect(checkOutcome(lateFee, ["c", "b"])).toBe("right");
    expect(checkOutcome(lateFee, ["b"])).toBe("wrong");
    expect(checkOutcome(lateFee, [])).toBe("unanswered");
    expect(checkOutcome(reminder, undefined)).toBe("unanswered");
  });

  it("keeps one answer for a single choice and any number for several", () => {
    expect(toggleChoice(["a"], "b", false, true)).toEqual(["b"]);
    expect(toggleChoice(["a"], "b", true, true)).toEqual(["a", "b"]);
    expect(toggleChoice(["a", "b"], "b", true, true)).toEqual(["a", "b"]);
    expect(toggleChoice(["a", "b"], "a", true, false)).toEqual(["b"]);
  });
});
