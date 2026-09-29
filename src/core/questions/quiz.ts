import type { TestQuestion } from "@/core/questions/questions";

/*
 * The final test as a quiz (webinar brief §2.6): authors may serve every
 * attempt a random draw from the questions (a pool), shuffle the questions
 * and their answers, and cap the number of attempts. Without any of it a
 * test serves every question in the authors' order, as it always did.
 *
 * What an attempt serves follows from a seed of the test, the learner, the
 * attempt number and the test version: the page shows the same questions
 * however often it loads, so reloading never draws an easier set, and the
 * next attempt draws anew. The attempt stores what it served, so grading,
 * "show mistakes" and history never depend on a later draw or edit.
 */

export interface QuizSettings {
  /** Questions served per attempt, drawn at random; null serves all of them. */
  poolSize: number | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  /** Attempts a learner has in total; null for unlimited (the hourly limit still applies). */
  maxAttempts: number | null;
}

/** Attempts per learner and hour whatever the limit: guessing by script stays impractical. */
export const TEST_ATTEMPTS_PER_HOUR = 10;

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  poolSize: null,
  shuffleQuestions: false,
  shuffleOptions: false,
  maxAttempts: null,
};

/** A question as one attempt served it: the options in the order the learner saw them. */
export interface ServedQuestion {
  id: string;
  options: string[];
}

/** A 32-bit hash of the seed text (a mix in the style of MurmurHash3's finaliser). */
function hash32(text: string): number {
  let h = 1779033703 ^ text.length;
  for (let index = 0; index < text.length; index++) {
    h = Math.imul(h ^ text.charCodeAt(index), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Numbers in [0, 1) that depend only on the seed (mulberry32). Not for
 * secrets: it only has to spread questions evenly and repeat for a seed.
 */
export function seededRandom(seed: string): () => number {
  let state = hash32(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A new array in random order (Fisher–Yates). */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [out[index], out[other]] = [out[other]!, out[index]!];
  }
  return out;
}

/**
 * The seed of one attempt. The test's id is never shown to learners, so they
 * cannot work out ahead which questions a later attempt draws.
 */
export function attemptSeed(parts: {
  testId: string;
  userId: string;
  attemptNo: number;
  version: number;
}): string {
  return `${parts.testId}:${parts.userId}:${parts.attemptNo}:${parts.version}`;
}

/** How many questions an attempt serves. */
export function servedCount(total: number, poolSize: number | null): number {
  return poolSize === null ? total : Math.min(total, poolSize);
}

/** Whether attempts see different questions or orders, so an answer sheet belongs to one attempt. */
export function variesByAttempt(settings: QuizSettings, total: number): boolean {
  return (
    settings.shuffleQuestions ||
    settings.shuffleOptions ||
    servedCount(total, settings.poolSize) < total
  );
}

/**
 * What one attempt serves. A draw from a pool keeps the authors' order unless
 * questions are shuffled too; answers keep theirs unless they are shuffled.
 */
export function serveQuestions(
  questions: readonly TestQuestion[],
  settings: QuizSettings,
  random: () => number,
): ServedQuestion[] {
  const count = servedCount(questions.length, settings.poolSize);
  let picked = questions.map((_, index) => index);
  if (count < questions.length) {
    picked = shuffled(picked, random).slice(0, count);
    if (!settings.shuffleQuestions) picked.sort((a, b) => a - b);
  } else if (settings.shuffleQuestions) {
    picked = shuffled(picked, random);
  }
  return picked.map((index) => {
    const question = questions[index]!;
    const ids = question.options.map((option) => option.id);
    return { id: question.id, options: settings.shuffleOptions ? shuffled(ids, random) : ids };
  });
}

/**
 * The test's questions as an attempt served them, in its order and with its
 * answer order. Questions or answers the test no longer has are left out.
 */
export function questionsAsServed(
  questions: readonly TestQuestion[],
  served: readonly ServedQuestion[],
): TestQuestion[] {
  const byId = new Map(questions.map((question) => [question.id, question]));
  return served.flatMap((entry) => {
    const question = byId.get(entry.id);
    if (!question) return [];
    const options = entry.options.flatMap((id) => {
      const option = question.options.find((candidate) => candidate.id === id);
      return option ? [option] : [];
    });
    return [{ ...question, options }];
  });
}

/** Attempts still open to a learner; null when there is no limit. */
export function attemptsLeft(maxAttempts: number | null, taken: number): number | null {
  return maxAttempts === null ? null : Math.max(0, maxAttempts - taken);
}
