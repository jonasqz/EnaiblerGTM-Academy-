import { describe, expect, it } from "vitest";

import {
  answersFromForm,
  checkQuestionsSchema,
  courseTestSchema,
  gradeAnswers,
  gradePercent,
  isAnswerCorrect,
  passesTest,
  publicTestQuestions,
  untranslatedQuestions,
  type TestQuestion,
} from "@/core/questions/questions";

const lateFee: TestQuestion = {
  id: "q1",
  prompt: { en: "What may you charge a business client who pays late?", de: "Was darfst du …?" },
  options: [
    { id: "a", text: { en: "Nothing", de: "Nichts" } },
    { id: "b", text: { en: "A flat fee of 40 euros", de: "Pauschal 40 Euro" } },
    { id: "c", text: { en: "Interest", de: "Zinsen" } },
  ],
  correct: ["b", "c"],
};
const reminder: TestQuestion = {
  id: "q2",
  prompt: { en: "When does the first reminder go out?" },
  options: [
    { id: "a", text: { en: "After a week" } },
    { id: "b", text: { en: "After a year" } },
  ],
  correct: ["a"],
};

describe("multiple-choice questions", () => {
  it("counts an answer only when it picks exactly the right options", () => {
    expect(isAnswerCorrect(lateFee, ["b", "c"])).toBe(true);
    expect(isAnswerCorrect(lateFee, ["c", "b"])).toBe(true);
    expect(isAnswerCorrect(lateFee, ["b"])).toBe(false);
    expect(isAnswerCorrect(lateFee, ["a", "b", "c"])).toBe(false);
    expect(isAnswerCorrect(lateFee, [])).toBe(false);
    expect(isAnswerCorrect(lateFee, undefined)).toBe(false);
  });

  it("grades a test and never rounds up to the pass mark", () => {
    const grade = gradeAnswers([lateFee, reminder], { q1: ["b"], q2: ["a"] });
    expect(grade).toEqual({ correct: 1, total: 2, wrong: ["q1"] });
    expect(gradePercent(grade)).toBe(50);
    expect(passesTest(grade, 50)).toBe(true);
    expect(passesTest(grade, 51)).toBe(false);
    expect(gradePercent({ correct: 4, total: 5 })).toBe(80);
    expect(passesTest({ correct: 79, total: 99 }, 80)).toBe(false);
    expect(gradePercent({ correct: 79, total: 99 })).toBe(79);
    expect(passesTest({ correct: 0, total: 0 }, 1)).toBe(false);
  });

  it("shows learners the questions without the answer key", () => {
    const shown = publicTestQuestions([lateFee, reminder], "de", ["en"]);
    expect(shown[0]).toEqual({
      id: "q1",
      prompt: "Was darfst du …?",
      options: [
        { id: "a", text: "Nichts" },
        { id: "b", text: "Pauschal 40 Euro" },
        { id: "c", text: "Zinsen" },
      ],
      several: true,
    });
    expect(shown[1]?.prompt).toBe("When does the first reminder go out?");
    expect(JSON.stringify(shown)).not.toContain("correct");
  });

  it("reads answers from a form and ignores options that do not exist", () => {
    const answers = answersFromForm(
      [
        ["answer.q1", "b"],
        ["answer.q1", "c"],
        ["answer.q1", "c"],
        ["answer.q1", "z"],
        ["answer.q9", "a"],
        ["other", "a"],
      ],
      [lateFee, reminder],
    );
    expect(answers).toEqual({ q1: ["b", "c"] });
  });

  it("finds questions that still need a translation", () => {
    expect(untranslatedQuestions([lateFee, reminder], "de").map((q) => q.id)).toEqual(["q2"]);
    expect(untranslatedQuestions([lateFee, reminder], "en")).toEqual([]);
  });

  it("refuses answer keys that do not fit the options", () => {
    const check = {
      id: "k1",
      prompt: "Which fee applies?",
      options: [
        { id: "a", text: "40 euros" },
        { id: "b", text: "None" },
      ],
      correct: ["a"],
    };
    expect(checkQuestionsSchema.safeParse([check]).success).toBe(true);
    expect(checkQuestionsSchema.safeParse([{ ...check, correct: [] }]).success).toBe(false);
    expect(checkQuestionsSchema.safeParse([{ ...check, correct: ["x"] }]).success).toBe(false);
    expect(
      checkQuestionsSchema.safeParse([{ ...check, options: [check.options[0]] }]).success,
    ).toBe(false);
    expect(checkQuestionsSchema.safeParse([check, check]).success).toBe(false);
    expect(
      courseTestSchema.safeParse({ questions: [lateFee], passPercent: 0, showMistakes: true })
        .success,
    ).toBe(false);
    expect(
      courseTestSchema.safeParse({ questions: [lateFee], passPercent: 80, showMistakes: true })
        .success,
    ).toBe(true);
  });
});
