import { SUPPORTED_LOCALES, type Locale, type LocalizedText } from "@/core/i18n/locales";
import type { TestQuestion } from "@/core/questions/questions";

/*
 * Editing a course's final test in the Studio. The editor posts its draft as
 * JSON; the server cleans it the way the editor does to tell whether anything
 * changed, validates it with courseTestSchema and words what does not fit
 * from the codes below. Texts are kept in every language they were written
 * in, including languages the course no longer offers, so switching a
 * language off and on again loses nothing.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Trimmed text per supported language; empty languages are left out. */
function cleanText(value: unknown): LocalizedText {
  const out: LocalizedText = {};
  if (!isRecord(value)) return out;
  for (const locale of SUPPORTED_LOCALES) {
    const text = value[locale];
    if (typeof text === "string" && text.trim()) out[locale] = text.trim();
  }
  return out;
}

function cleanOption(value: unknown): unknown {
  return isRecord(value) ? { id: value.id, text: cleanText(value.text) } : value;
}

function cleanQuestion(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const options = Array.isArray(value.options) ? value.options.map(cleanOption) : value.options;
  const ids = Array.isArray(options)
    ? options.flatMap((option) =>
        isRecord(option) && typeof option.id === "string" ? [option.id] : [],
      )
    : [];
  const chosen = value.correct;
  // In option order and once each, so ticking answers in another order is no change.
  const correct = Array.isArray(chosen)
    ? ids.filter((id, index) => chosen.includes(id) && ids.indexOf(id) === index)
    : chosen;
  return { id: value.id, prompt: cleanText(value.prompt), options, correct };
}

/**
 * The editor's draft as courseTestSchema expects it: texts trimmed, empty
 * languages dropped, right answers in option order. Anything that is not
 * shaped like a draft passes through for the schema to reject.
 */
export function cleanTestDraft(input: unknown): unknown {
  if (!isRecord(input)) return input;
  return {
    questions: Array.isArray(input.questions)
      ? input.questions.map(cleanQuestion)
      : input.questions,
    passPercent: input.passPercent,
    showMistakes: input.showMistakes,
  };
}

export type TestIssueCode =
  | "too_many_questions"
  | "question_text"
  | "question_too_long"
  | "option_text"
  | "option_too_long"
  | "too_few_options"
  | "too_many_options"
  | "no_right_answer"
  | "pass_percent"
  | "invalid";

export interface TestIssue {
  code: TestIssueCode;
  /** 1-based, as the editor numbers them. */
  question?: number;
  option?: number;
  /** For `invalid`: where, for a bug report. */
  path?: string;
}

/**
 * A courseTestSchema issue as a code the Studio can word. Paths look like
 * questions.2.prompt(.de) or questions.2.options.1.text(.de); a language at
 * the end means that text is too long, none means it is missing everywhere.
 */
export function testIssueOf(issue: { code: string; path: readonly PropertyKey[] }): TestIssue {
  const [head, questionIndex, field, ...rest] = issue.path;
  const tooBig = issue.code === "too_big";
  const invalid = (question?: number): TestIssue => ({
    code: "invalid",
    ...(question === undefined ? {} : { question }),
    path: issue.path.map(String).join("."),
  });
  if (head === "passPercent") return { code: "pass_percent" };
  if (head !== "questions") return invalid();
  if (typeof questionIndex !== "number") {
    return tooBig && field === undefined ? { code: "too_many_questions" } : invalid();
  }
  const question = questionIndex + 1;
  if (field === "prompt") {
    if (rest.length === 0) return { code: "question_text", question };
    return tooBig ? { code: "question_too_long", question } : invalid(question);
  }
  if (field === "correct") {
    return issue.code === "too_small" && rest.length === 0
      ? { code: "no_right_answer", question }
      : invalid(question);
  }
  if (field !== "options") return invalid(question);
  const [optionIndex, part, language] = rest;
  if (optionIndex === undefined) {
    if (issue.code === "too_small") return { code: "too_few_options", question };
    if (tooBig) return { code: "too_many_options", question };
    return invalid(question);
  }
  if (typeof optionIndex !== "number" || part !== "text") return invalid(question);
  const option = optionIndex + 1;
  if (language === undefined) return { code: "option_text", question, option };
  return tooBig ? { code: "option_too_long", question, option } : invalid(question);
}

/** The same issue reported twice (e.g. per language) is worded once. */
export function sameTestIssue(a: TestIssue, b: TestIssue): boolean {
  return a.code === b.code && a.question === b.question && a.option === b.option;
}

export interface QuestionGaps {
  /** Course languages the question is not written in yet. */
  prompt: Locale[];
  /** Course languages at least one option is not written in yet. */
  options: Locale[];
  noRightAnswer: boolean;
}

/** What a question still lacks: saving needs a right answer, publishing every course language. */
export function questionGaps(question: TestQuestion, languages: readonly Locale[]): QuestionGaps {
  return {
    prompt: languages.filter((locale) => !question.prompt[locale]?.trim()),
    options: languages.filter((locale) =>
      question.options.some((option) => !option.text[locale]?.trim()),
    ),
    noRightAnswer: !question.options.some((option) => question.correct.includes(option.id)),
  };
}

export function hasGaps(gaps: QuestionGaps): boolean {
  return gaps.prompt.length > 0 || gaps.options.length > 0 || gaps.noRightAnswer;
}
