import { describe, expect, it } from "vitest";

import { summarizeAttempts, unansweredQuestions } from "@/core/questions/attempts";

const at = (day: number) => new Date(Date.UTC(2026, 8, day));

describe("a learner's attempts at the final test", () => {
  it("has nothing to say before the first attempt", () => {
    expect(summarizeAttempts([])).toEqual({ count: 0, latest: null, best: null, passed: null });
  });

  it("names the latest, the best and the passing attempt", () => {
    const summary = summarizeAttempts([
      { attemptNo: 3, correct: 9, total: 10, passed: true, createdAt: at(3) },
      { attemptNo: 1, correct: 7, total: 10, passed: false, createdAt: at(1) },
      { attemptNo: 2, correct: 5, total: 10, passed: false, createdAt: at(2) },
    ]);
    expect(summary.count).toBe(3);
    expect(summary.latest).toMatchObject({ attemptNo: 3, percent: 90, takenAt: at(3) });
    expect(summary.best?.attemptNo).toBe(3);
    expect(summary.passed?.attemptNo).toBe(3);
  });

  it("compares shares, not counts, and keeps the earlier attempt on a tie", () => {
    // The test grew from 4 to 8 questions between the attempts.
    const summary = summarizeAttempts([
      { attemptNo: 1, correct: 3, total: 4, passed: false, createdAt: at(1) },
      { attemptNo: 2, correct: 5, total: 8, passed: false, createdAt: at(2) },
      { attemptNo: 3, correct: 6, total: 8, passed: false, createdAt: at(3) },
    ]);
    expect(summary.best).toMatchObject({ attemptNo: 1, percent: 75 });
    expect(summary.latest?.attemptNo).toBe(3);
    expect(summary.passed).toBeNull();
  });

  it("rounds the percentage down, like the pass mark", () => {
    const summary = summarizeAttempts([
      { attemptNo: 1, correct: 2, total: 3, passed: false, createdAt: at(1) },
    ]);
    expect(summary.latest?.percent).toBe(66);
  });
});

describe("unanswered questions", () => {
  it("lists the questions without a chosen option, in test order", () => {
    const questions = [{ id: "q1" }, { id: "q2" }, { id: "q3" }];
    expect(unansweredQuestions(questions, { q2: ["a"], q3: [] })).toEqual(["q1", "q3"]);
    expect(unansweredQuestions(questions, { q1: ["a"], q2: ["b", "c"], q3: ["a"] })).toEqual([]);
  });
});
