import { describe, expect, it } from "vitest";

import { courseTestSchema, type TestQuestion } from "@/core/questions/questions";
import {
  cleanTestDraft,
  hasGaps,
  questionGaps,
  sameTestIssue,
  testIssueOf,
} from "@/core/questions/test-editing";
import { sameJson } from "@/core/shared/json";

const draft = {
  passPercent: 80,
  showMistakes: true,
  questions: [
    {
      id: "q1",
      prompt: { en: "  When does the first reminder go out?  ", de: "   " },
      options: [
        { id: "a", text: { en: "After a week", de: "" } },
        { id: "b", text: { en: " After a year " } },
      ],
      correct: ["b", "a", "b"],
    },
  ],
};

describe("saving the final test from the editor", () => {
  it("trims texts, drops empty languages and orders the right answers", () => {
    expect(cleanTestDraft(draft)).toEqual({
      passPercent: 80,
      showMistakes: true,
      // A draft from before quizzes: every question, in order, no limit.
      poolSize: null,
      shuffleQuestions: false,
      shuffleOptions: false,
      maxAttempts: null,
      questions: [
        {
          id: "q1",
          prompt: { en: "When does the first reminder go out?" },
          options: [
            { id: "a", text: { en: "After a week" } },
            { id: "b", text: { en: "After a year" } },
          ],
          correct: ["a", "b"],
        },
      ],
    });
    expect(courseTestSchema.safeParse(cleanTestDraft(draft)).success).toBe(true);
  });

  it("keeps texts in languages the course no longer offers and drops unknown ones", () => {
    const cleaned = cleanTestDraft({
      ...draft,
      questions: [{ ...draft.questions[0], prompt: { de: "Wann?", fr: "Quand ?" } }],
    }) as { questions: Array<{ prompt: unknown }> };
    expect(cleaned.questions[0]?.prompt).toEqual({ de: "Wann?" });
  });

  it("sees no change when only whitespace or the order of ticking differs", () => {
    const ticked = {
      ...draft,
      questions: [{ ...draft.questions[0], correct: ["a", "b"] }],
    };
    expect(sameJson(cleanTestDraft(draft), cleanTestDraft(ticked))).toBe(true);
  });

  it("leaves what is not a draft for the schema to reject", () => {
    expect(cleanTestDraft(null)).toBeNull();
    expect(courseTestSchema.safeParse(cleanTestDraft("test")).success).toBe(false);
    expect(
      courseTestSchema.safeParse(cleanTestDraft({ ...draft, questions: "none" })).success,
    ).toBe(false);
  });
});

describe("wording what does not fit", () => {
  const issues = (input: unknown) => {
    const result = courseTestSchema.safeParse(cleanTestDraft(input));
    return result.success ? [] : result.error.issues.map(testIssueOf);
  };

  it("names the question and option for missing texts and answers", () => {
    expect(
      issues({
        passPercent: 80,
        showMistakes: true,
        questions: [
          { id: "q1", prompt: { en: " " }, options: [{ id: "a", text: {} }], correct: [] },
        ],
      }),
    ).toEqual([
      { code: "question_text", question: 1 },
      { code: "option_text", question: 1, option: 1 },
      { code: "too_few_options", question: 1 },
      { code: "no_right_answer", question: 1 },
    ]);
  });

  it("tells too long texts, too many options and a pass mark out of range apart", () => {
    const long = {
      id: "q1",
      prompt: { en: "x".repeat(501) },
      options: [
        { id: "a", text: { en: "y".repeat(201) } },
        ...["b", "c", "d", "e", "f", "g"].map((id) => ({ id, text: { en: id } })),
      ],
      correct: ["b"],
    };
    expect(issues({ passPercent: 0, showMistakes: true, questions: [long] })).toEqual([
      { code: "question_too_long", question: 1 },
      { code: "option_too_long", question: 1, option: 1 },
      { code: "too_many_options", question: 1 },
      { code: "pass_percent" },
    ]);
  });

  it("counts questions and reports anything else with its path", () => {
    const question = (id: string) => ({
      id,
      prompt: { en: "Why?" },
      options: [
        { id: "a", text: { en: "Because" } },
        { id: "b", text: { en: "Why not" } },
      ],
      correct: ["a"],
    });
    expect(
      issues({
        passPercent: 80,
        showMistakes: true,
        questions: Array.from({ length: 51 }, (_, index) => question(`q${index}`)),
      }),
    ).toEqual([{ code: "too_many_questions" }]);
    expect(
      issues({ passPercent: 80, showMistakes: true, questions: [question("q"), question("q")] }),
    ).toEqual([{ code: "invalid", path: "questions" }]);
    expect(testIssueOf({ code: "custom", path: ["questions", 2, "options"] })).toEqual({
      code: "invalid",
      question: 3,
      path: "questions.2.options",
    });
  });

  it("checks the pool against the questions and the attempt limit's range", () => {
    const question = (id: string) => ({
      id,
      prompt: { en: "Why?" },
      options: [
        { id: "a", text: { en: "Because" } },
        { id: "b", text: { en: "Why not" } },
      ],
      correct: ["a"],
    });
    const two = [question("q1"), question("q2")];
    expect(issues({ passPercent: 80, showMistakes: true, questions: two, poolSize: 3 })).toEqual([
      { code: "pool_too_large" },
    ]);
    expect(
      issues({ passPercent: 80, showMistakes: true, questions: two, poolSize: 0, maxAttempts: 21 }),
    ).toEqual([{ code: "pool_size" }, { code: "max_attempts" }]);
    // Emptied number fields are no pool and no limit.
    expect(
      issues({
        passPercent: 80,
        showMistakes: true,
        questions: two,
        poolSize: Number.NaN,
        maxAttempts: "",
      }),
    ).toEqual([]);
    expect(
      issues({
        passPercent: 80,
        showMistakes: true,
        questions: [{ ...question("q1"), explanation: { en: "z".repeat(1001) } }],
      }),
    ).toEqual([{ code: "explanation_too_long", question: 1 }]);
  });

  it("keeps an explanation and a source and drops empty ones", () => {
    const cleaned = cleanTestDraft({
      passPercent: 80,
      showMistakes: true,
      questions: [
        {
          id: "q1",
          prompt: { en: "Why?" },
          options: [{ id: "a", text: { en: "Because" } }],
          correct: ["a"],
          explanation: { en: " It says so. ", de: " " },
          source: " Webinar · Pricing (12:30) ",
        },
        {
          id: "q2",
          prompt: { en: "Why?" },
          options: [{ id: "a", text: { en: "Because" } }],
          correct: ["a"],
          explanation: { en: "" },
          source: "  ",
        },
      ],
    }) as { questions: Array<Record<string, unknown>> };
    expect(cleaned.questions[0]).toMatchObject({
      explanation: { en: "It says so." },
      source: "Webinar · Pricing (12:30)",
    });
    expect(cleaned.questions[1]).not.toHaveProperty("explanation");
    expect(cleaned.questions[1]).not.toHaveProperty("source");
  });

  it("recognises the same issue reported for two languages", () => {
    expect(
      sameTestIssue(
        { code: "option_too_long", question: 1, option: 2 },
        { code: "option_too_long", question: 1, option: 2 },
      ),
    ).toBe(true);
    expect(
      sameTestIssue(
        { code: "option_too_long", question: 1, option: 2 },
        { code: "option_too_long", question: 1, option: 3 },
      ),
    ).toBe(false);
  });
});

describe("what a question still lacks", () => {
  const question: TestQuestion = {
    id: "q1",
    prompt: { en: "What may you charge?" },
    options: [
      { id: "a", text: { en: "Interest", de: "Zinsen" } },
      { id: "b", text: { en: "Nothing" } },
    ],
    correct: [],
  };

  it("lists the course languages still missing and a missing right answer", () => {
    expect(questionGaps(question, ["en", "de"])).toEqual({
      prompt: ["de"],
      options: ["de"],
      noRightAnswer: true,
    });
    expect(hasGaps(questionGaps(question, ["en"]))).toBe(true);
  });

  it("is complete when every course language and a right answer are there", () => {
    const done = { ...question, correct: ["a"] };
    expect(questionGaps(done, ["en"])).toEqual({ prompt: [], options: [], noRightAnswer: false });
    expect(hasGaps(questionGaps(done, ["en"]))).toBe(false);
    // A right answer that is no longer an option does not count.
    expect(questionGaps({ ...question, correct: ["gone"] }, ["en"]).noRightAnswer).toBe(true);
  });
});
