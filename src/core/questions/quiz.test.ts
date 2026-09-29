import { describe, expect, it } from "vitest";

import { gradeAnswers, publicTestQuestions, type TestQuestion } from "@/core/questions/questions";
import {
  attemptSeed,
  attemptsLeft,
  DEFAULT_QUIZ_SETTINGS,
  questionsAsServed,
  seededRandom,
  servedCount,
  serveQuestions,
  shuffled,
  variesByAttempt,
} from "@/core/questions/quiz";

const question = (n: number): TestQuestion => ({
  id: `q${n}`,
  prompt: { en: `Question ${n}?` },
  options: [
    { id: "a", text: { en: "A" } },
    { id: "b", text: { en: "B" } },
    { id: "c", text: { en: "C" } },
    { id: "d", text: { en: "D" } },
  ],
  correct: ["a"],
});

const TEN = Array.from({ length: 10 }, (_, index) => question(index + 1));
const seed = (attemptNo: number, userId = "learner-1") =>
  attemptSeed({ testId: "test-1", userId, attemptNo, version: 3 });

describe("seeded randomness", () => {
  it("repeats for a seed and differs between seeds", () => {
    const a = seededRandom("seed");
    const b = seededRandom("seed");
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
    const other = seededRandom("another seed");
    expect([other(), other(), other()]).not.toEqual(first);
  });

  it("shuffles without losing or repeating an item", () => {
    const items = Array.from({ length: 20 }, (_, index) => index);
    const mixed = shuffled(items, seededRandom("mix"));
    expect(mixed).not.toEqual(items);
    expect([...mixed].sort((a, b) => a - b)).toEqual(items);
    expect(items).toEqual(Array.from({ length: 20 }, (_, index) => index));
  });

  it("builds the attempt's seed from test, learner, attempt and version", () => {
    expect(seed(2)).toBe("test-1:learner-1:2:3");
  });
});

describe("what an attempt serves", () => {
  it("serves every question in the authors' order without quiz settings", () => {
    const served = serveQuestions(TEN, DEFAULT_QUIZ_SETTINGS, seededRandom(seed(1)));
    expect(served.map((entry) => entry.id)).toEqual(TEN.map((entry) => entry.id));
    expect(served[0]?.options).toEqual(["a", "b", "c", "d"]);
    expect(variesByAttempt(DEFAULT_QUIZ_SETTINGS, TEN.length)).toBe(false);
  });

  it("draws the pool anew per attempt, keeps the authors' order and repeats on reload", () => {
    const settings = { ...DEFAULT_QUIZ_SETTINGS, poolSize: 4 };
    const first = serveQuestions(TEN, settings, seededRandom(seed(1)));
    expect(first).toHaveLength(4);
    expect(new Set(first.map((entry) => entry.id)).size).toBe(4);
    const order = first.map((entry) => TEN.findIndex((q) => q.id === entry.id));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Reloading the page shows the same draw.
    expect(serveQuestions(TEN, settings, seededRandom(seed(1)))).toEqual(first);
    // Another attempt or another learner draws differently (for these seeds).
    expect(serveQuestions(TEN, settings, seededRandom(seed(2)))).not.toEqual(first);
    expect(serveQuestions(TEN, settings, seededRandom(seed(1, "learner-2")))).not.toEqual(first);
    expect(variesByAttempt(settings, TEN.length)).toBe(true);
    // A pool as large as the test is no draw.
    expect(variesByAttempt({ ...settings, poolSize: 10 }, TEN.length)).toBe(false);
  });

  it("shuffles questions and answers only when asked", () => {
    const questionsOnly = serveQuestions(
      TEN,
      { ...DEFAULT_QUIZ_SETTINGS, shuffleQuestions: true },
      seededRandom(seed(1)),
    );
    expect(questionsOnly.map((entry) => entry.id)).not.toEqual(TEN.map((entry) => entry.id));
    expect(questionsOnly.every((entry) => entry.options.join("") === "abcd")).toBe(true);

    const answersOnly = serveQuestions(
      TEN,
      { ...DEFAULT_QUIZ_SETTINGS, shuffleOptions: true },
      seededRandom(seed(1)),
    );
    expect(answersOnly.map((entry) => entry.id)).toEqual(TEN.map((entry) => entry.id));
    expect(answersOnly.some((entry) => entry.options.join("") !== "abcd")).toBe(true);
    expect(answersOnly.every((entry) => [...entry.options].sort().join("") === "abcd")).toBe(true);
  });

  it("counts what an attempt serves and the attempts left", () => {
    expect(servedCount(10, null)).toBe(10);
    expect(servedCount(10, 4)).toBe(4);
    expect(servedCount(3, 4)).toBe(3);
    expect(attemptsLeft(null, 7)).toBeNull();
    expect(attemptsLeft(3, 1)).toBe(2);
    expect(attemptsLeft(3, 5)).toBe(0);
  });
});

describe("grading against what was served", () => {
  const settings = { ...DEFAULT_QUIZ_SETTINGS, poolSize: 3, shuffleOptions: true };
  const served = serveQuestions(TEN, settings, seededRandom(seed(4)));
  const asServed = questionsAsServed(TEN, served);

  it("shows learners the served questions in the served answer order, without the key", () => {
    const shown = publicTestQuestions(asServed, "en");
    expect(shown.map((entry) => entry.id)).toEqual(served.map((entry) => entry.id));
    expect(shown.map((entry) => entry.options.map((option) => option.id))).toEqual(
      served.map((entry) => entry.options),
    );
    expect(JSON.stringify(shown)).not.toContain("correct");
  });

  it("grades only the served questions, whatever the order of the answers", () => {
    const answers = Object.fromEntries(served.map((entry) => [entry.id, ["a"]]));
    expect(gradeAnswers(asServed, answers)).toEqual({ correct: 3, total: 3, wrong: [] });
    const [first, ...rest] = served;
    const oneWrong = { ...answers, [first!.id]: ["b"] };
    expect(gradeAnswers(asServed, oneWrong)).toEqual({
      correct: 2,
      total: 3,
      wrong: [first!.id],
    });
    expect(rest).toHaveLength(2);
  });

  it("leaves out questions and answers the test no longer has", () => {
    const edited = TEN.map((entry) =>
      entry.id === served[0]!.id
        ? { ...entry, options: entry.options.filter((option) => option.id !== "d") }
        : entry,
    ).filter((entry) => entry.id !== served[1]!.id);
    const again = questionsAsServed(edited, served);
    expect(again.map((entry) => entry.id)).toEqual([served[0]!.id, served[2]!.id]);
    expect(again[0]!.options.map((option) => option.id)).toEqual(
      served[0]!.options.filter((id) => id !== "d"),
    );
  });
});
