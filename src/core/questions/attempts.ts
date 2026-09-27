import { gradePercent, type Answers } from "@/core/questions/questions";

/** A graded attempt at a course's final test, as the learner sees it. */
export interface TestAttemptSummary {
  attemptNo: number;
  correct: number;
  total: number;
  percent: number;
  passed: boolean;
  takenAt: Date;
}

export interface TestAttempts {
  count: number;
  latest: TestAttemptSummary | null;
  /** The largest share of right answers; the earlier attempt on a tie. */
  best: TestAttemptSummary | null;
  /** The attempt that passed; none follow it. */
  passed: TestAttemptSummary | null;
}

export function summarizeAttempts(
  rows: ReadonlyArray<{
    attemptNo: number;
    correct: number;
    total: number;
    passed: boolean;
    createdAt: Date;
  }>,
): TestAttempts {
  const attempts = [...rows]
    .sort((a, b) => a.attemptNo - b.attemptNo)
    .map((row): TestAttemptSummary => ({
      attemptNo: row.attemptNo,
      correct: row.correct,
      total: row.total,
      percent: gradePercent(row),
      passed: row.passed,
      takenAt: row.createdAt,
    }));
  let best: TestAttemptSummary | null = null;
  // Compared as fractions: attempts at an edited test can differ in length.
  for (const attempt of attempts) {
    if (!best || attempt.correct * best.total > best.correct * attempt.total) best = attempt;
  }
  return {
    count: attempts.length,
    latest: attempts.at(-1) ?? null,
    best,
    passed: attempts.find((attempt) => attempt.passed) ?? null,
  };
}

/** Questions without a chosen option: a test is handed in complete. */
export function unansweredQuestions(
  questions: ReadonlyArray<{ id: string }>,
  answers: Answers,
): string[] {
  return questions
    .filter((question) => (answers[question.id]?.length ?? 0) === 0)
    .map((question) => question.id);
}
