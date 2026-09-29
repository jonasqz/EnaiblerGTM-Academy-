import { z } from "zod";

import { localeSchema, localize, type Locale, type LocalizedText } from "@/core/i18n/locales";
import type { QuizSettings } from "@/core/questions/quiz";

/*
 * Multiple-choice questions, in two places:
 *   - knowledge checks at the end of a lesson: practice, checked in the
 *     browser, written in the lesson's language;
 *   - the final test of a course whose authors chose it: graded on the
 *     server, in every course language, never sent to learners with answers.
 * One or more options can be right; an answer counts only when it picks
 * exactly those.
 */

export const QUESTION_LIMITS = {
  prompt: 500,
  option: 200,
  explanation: 1000,
  minOptions: 2,
  maxOptions: 6,
  /** Per lesson: a check, not a second lesson. */
  checkQuestions: 10,
  testQuestions: 50,
  /** Where an AI draft took a test question from (source · chapter · time). */
  source: 200,
  /** A limit on attempts above this is no limit worth setting. */
  maxAttempts: 20,
} as const;

/** Below this, a final test says little about what someone learned. */
export const MIN_USEFUL_TEST_QUESTIONS = 5;

export const DEFAULT_PASS_PERCENT = 80;

export const questionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Invalid id");

export interface CheckQuestion {
  id: string;
  prompt: string;
  options: Array<{ id: string; text: string }>;
  /** Ids of the right options. */
  correct: string[];
  /** Shown once the learner has answered. */
  explanation?: string;
}

export interface TestQuestion {
  id: string;
  prompt: LocalizedText;
  options: Array<{ id: string; text: LocalizedText }>;
  correct: string[];
  /** Why the right answers are right: for the authors' review, never sent to learners. */
  explanation?: LocalizedText;
  /** Where an AI draft took the question from, for the authors. */
  source?: string;
}

/** Pool, shuffling and the attempt limit are in ./quiz.ts. */
export interface CourseTestDefinition extends QuizSettings {
  questions: TestQuestion[];
  /** Share of the served questions answered right to pass, 1–100. */
  passPercent: number;
  /** After an attempt, show which questions were wrong (never the right answers). */
  showMistakes: boolean;
}

type AnswerKey = { options: ReadonlyArray<{ id: string }>; correct: readonly string[] };

function checkAnswerKey(question: AnswerKey, ctx: z.RefinementCtx) {
  const ids = question.options.map((option) => option.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: "custom", message: "Options need distinct ids", path: ["options"] });
  }
  if (new Set(question.correct).size !== question.correct.length) {
    ctx.addIssue({ code: "custom", message: "Right answers are listed twice", path: ["correct"] });
  }
  if (question.correct.some((id) => !ids.includes(id))) {
    ctx.addIssue({
      code: "custom",
      message: "A right answer is not one of the options",
      path: ["correct"],
    });
  }
}

function checkDistinctIds(questions: ReadonlyArray<{ id: string }>, ctx: z.RefinementCtx) {
  const ids = questions.map((question) => question.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: "custom", message: "Questions need distinct ids" });
  }
}

const plain = (max: number) => z.string().trim().min(1).max(max);
const localized = (max: number) =>
  z
    .partialRecord(localeSchema, z.string().trim().min(1).max(max))
    .refine((value) => Object.keys(value).length > 0, "Write it in at least one language");

export const checkQuestionSchema = z
  .strictObject({
    id: questionIdSchema,
    prompt: plain(QUESTION_LIMITS.prompt),
    options: z
      .array(z.strictObject({ id: questionIdSchema, text: plain(QUESTION_LIMITS.option) }))
      .min(QUESTION_LIMITS.minOptions)
      .max(QUESTION_LIMITS.maxOptions),
    correct: z.array(questionIdSchema).min(1, "Mark at least one right answer"),
    explanation: z.string().trim().max(QUESTION_LIMITS.explanation).optional(),
  })
  .superRefine(checkAnswerKey);

export const checkQuestionsSchema = z
  .array(checkQuestionSchema)
  .max(QUESTION_LIMITS.checkQuestions)
  .superRefine(checkDistinctIds);

export const testQuestionSchema = z
  .strictObject({
    id: questionIdSchema,
    prompt: localized(QUESTION_LIMITS.prompt),
    options: z
      .array(z.strictObject({ id: questionIdSchema, text: localized(QUESTION_LIMITS.option) }))
      .min(QUESTION_LIMITS.minOptions)
      .max(QUESTION_LIMITS.maxOptions),
    correct: z.array(questionIdSchema).min(1, "Mark at least one right answer"),
    explanation: localized(QUESTION_LIMITS.explanation).optional(),
    source: z.string().trim().min(1).max(QUESTION_LIMITS.source).optional(),
  })
  .superRefine(checkAnswerKey);

/** Left out, the quiz settings keep a test as it was: every question, in order, no limit. */
export const courseTestSchema = z
  .strictObject({
    questions: z
      .array(testQuestionSchema)
      .max(QUESTION_LIMITS.testQuestions)
      .superRefine(checkDistinctIds),
    passPercent: z.number().int().min(1).max(100),
    showMistakes: z.boolean(),
    poolSize: z.number().int().min(1).max(QUESTION_LIMITS.testQuestions).nullable().default(null),
    shuffleQuestions: z.boolean().default(false),
    shuffleOptions: z.boolean().default(false),
    maxAttempts: z.number().int().min(1).max(QUESTION_LIMITS.maxAttempts).nullable().default(null),
  })
  .superRefine((test, ctx) => {
    // A draw needs questions to draw from.
    if (test.poolSize !== null && test.poolSize > test.questions.length) {
      ctx.addIssue({
        code: "custom",
        message: "The pool is larger than the test",
        path: ["poolSize"],
      });
    }
  });

export type CourseTestInput = z.input<typeof courseTestSchema>;

/** Several right answers: learners pick all of them ("choose all that apply"). */
export function hasSeveralAnswers(question: { correct: readonly string[] }): boolean {
  return question.correct.length > 1;
}

export type Answers = Readonly<Record<string, readonly string[]>>;

export function isAnswerCorrect(question: AnswerKey, chosen: readonly string[] | undefined) {
  if (!chosen || chosen.length === 0) return false;
  const picked = new Set(chosen);
  if (picked.size !== question.correct.length) return false;
  return question.correct.every((id) => picked.has(id));
}

export interface TestGrade {
  correct: number;
  total: number;
  /** Ids of the questions answered wrong or not at all. */
  wrong: string[];
}

export function gradeAnswers(
  questions: ReadonlyArray<AnswerKey & { id: string }>,
  answers: Answers,
): TestGrade {
  const wrong = questions
    .filter((question) => !isAnswerCorrect(question, answers[question.id]))
    .map((question) => question.id);
  return { correct: questions.length - wrong.length, total: questions.length, wrong };
}

/** Rounded down, so "79.9 %" never reads as the 80 % it did not reach. */
export function gradePercent(grade: Pick<TestGrade, "correct" | "total">): number {
  return grade.total === 0 ? 0 : Math.floor((grade.correct * 100) / grade.total);
}

export function passesTest(grade: Pick<TestGrade, "correct" | "total">, passPercent: number) {
  return grade.total > 0 && grade.correct * 100 >= passPercent * grade.total;
}

/** What learners get to see of a test question: no answer key. */
export interface PublicQuestion {
  id: string;
  prompt: string;
  options: Array<{ id: string; text: string }>;
  several: boolean;
}

export function publicTestQuestions(
  questions: readonly TestQuestion[],
  locale: Locale,
  fallbacks: readonly Locale[] = [],
): PublicQuestion[] {
  return questions.map((question) => ({
    id: question.id,
    prompt: localize(question.prompt, locale, fallbacks),
    options: question.options.map((option) => ({
      id: option.id,
      text: localize(option.text, locale, fallbacks),
    })),
    several: hasSeveralAnswers(question),
  }));
}

/**
 * Form fields named `answer.<question id>`, one per chosen option, as answers.
 * Unknown questions and options are kept out, so a tampered form cannot add any.
 */
export function answersFromForm(
  entries: Iterable<[string, unknown]>,
  questions: ReadonlyArray<{ id: string; options: ReadonlyArray<{ id: string }> }>,
): Record<string, string[]> {
  const answers: Record<string, string[]> = {};
  for (const [name, value] of entries) {
    if (!name.startsWith("answer.") || typeof value !== "string") continue;
    const question = questions.find((candidate) => candidate.id === name.slice(7));
    if (!question || !question.options.some((option) => option.id === value)) continue;
    const chosen = (answers[question.id] ??= []);
    if (!chosen.includes(value)) chosen.push(value);
  }
  return answers;
}

/** Questions of the final test that still lack text in a course language. */
export function untranslatedQuestions(
  questions: readonly TestQuestion[],
  locale: Locale,
): TestQuestion[] {
  return questions.filter(
    (question) =>
      !question.prompt[locale] || question.options.some((option) => !option.text[locale]),
  );
}

/** Every text of a question, for the wording lint. */
export function questionTexts(question: CheckQuestion): string[] {
  return [
    question.prompt,
    ...question.options.map((option) => option.text),
    ...(question.explanation ? [question.explanation] : []),
  ];
}

export function testQuestionTexts(question: TestQuestion): LocalizedText[] {
  return [
    question.prompt,
    ...question.options.map((option) => option.text),
    ...(question.explanation ? [question.explanation] : []),
  ];
}
