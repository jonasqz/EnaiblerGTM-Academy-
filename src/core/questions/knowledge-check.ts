import {
  checkQuestionsSchema,
  isAnswerCorrect,
  QUESTION_LIMITS,
  type CheckQuestion,
} from "@/core/questions/questions";

/*
 * Knowledge checks at the end of a lesson (see ./questions.ts): what the
 * lesson editor saves, and what learners see when they check their answers.
 * Practice only: nothing here is graded or stored per learner.
 */

/**
 * One spelling per content: trimmed, no empty explanation, right answers in
 * option order. Saving a check unchanged then never makes a new lesson version.
 */
export function cleanCheckQuestions(questions: readonly CheckQuestion[]): CheckQuestion[] {
  return questions.map((question) => {
    const explanation = question.explanation?.trim();
    return {
      id: question.id,
      prompt: question.prompt.trim(),
      options: question.options.map((option) => ({ id: option.id, text: option.text.trim() })),
      correct: question.options
        .filter((option) => question.correct.includes(option.id))
        .map((option) => option.id),
      ...(explanation ? { explanation } : {}),
    };
  });
}

/** What the editor's preview can show while the author is still writing. */
export function previewCheckQuestions(questions: readonly CheckQuestion[]): CheckQuestion[] {
  return cleanCheckQuestions(questions)
    .map((question) => {
      const options = question.options.filter((option) => option.text);
      const shown = new Set(options.map((option) => option.id));
      return { ...question, options, correct: question.correct.filter((id) => shown.has(id)) };
    })
    .filter((question) => question.prompt && question.options.length > 0);
}

/** Ids of the questions and answers in a check. */
export function checkIds(questions: readonly CheckQuestion[]): Set<string> {
  return new Set(
    questions.flatMap((question) => [question.id, ...question.options.map((option) => option.id)]),
  );
}

/** An id from `make` that the check does not use yet. */
export function unusedId(make: () => string, taken: ReadonlySet<string>): string {
  const base = make();
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** A blank question with the fewest answers a question may have. */
export function newCheckQuestion(
  questions: readonly CheckQuestion[],
  make: () => string,
): CheckQuestion {
  const taken = checkIds(questions);
  const next = () => {
    const id = unusedId(make, taken);
    taken.add(id);
    return id;
  };
  const id = next();
  const options = Array.from({ length: QUESTION_LIMITS.minOptions }, () => ({
    id: next(),
    text: "",
  }));
  return { id, prompt: "", options, correct: [] };
}

/** The list with one item moved a place up (-1) or down (+1); unchanged at either end. */
export function moveItem<T>(items: readonly T[], index: number, offset: -1 | 1): T[] {
  const next = [...items];
  const target = index + offset;
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/**
 * What stops a check from being saved, by code: the Studio words it
 * (checkIssueText). Questions and answers count from 1, as authors do.
 */
export type CheckIssueCode =
  | "unreadable"
  | "too_many"
  | "prompt_missing"
  | "prompt_long"
  | "options_few"
  | "options_many"
  | "option_missing"
  | "option_long"
  | "no_right_answer"
  | "explanation_long";

export interface CheckIssue {
  code: CheckIssueCode;
  question?: number;
  option?: number;
  min?: number;
  max?: number;
}

type SchemaIssue = { code: string; path: readonly PropertyKey[] };

function issueOf({ code, path }: SchemaIssue): CheckIssue {
  const [index, field, optionIndex, optionField] = path;
  const long = code === "too_big";
  const short = code === "too_small";
  if (typeof index !== "number") {
    return long
      ? { code: "too_many", max: QUESTION_LIMITS.checkQuestions }
      : { code: "unreadable" };
  }
  const question = index + 1;
  if (field === "prompt") {
    return long
      ? { code: "prompt_long", question, max: QUESTION_LIMITS.prompt }
      : { code: "prompt_missing", question };
  }
  if (field === "options" && typeof optionIndex === "number" && optionField === "text") {
    const option = optionIndex + 1;
    return long
      ? { code: "option_long", question, option, max: QUESTION_LIMITS.option }
      : { code: "option_missing", question, option };
  }
  if (field === "options" && path.length === 2 && short) {
    return { code: "options_few", question, min: QUESTION_LIMITS.minOptions };
  }
  if (field === "options" && path.length === 2 && long) {
    return { code: "options_many", question, max: QUESTION_LIMITS.maxOptions };
  }
  if (field === "correct" && path.length === 2 && short) {
    return { code: "no_right_answer", question };
  }
  if (field === "explanation" && long) {
    return { code: "explanation_long", question, max: QUESTION_LIMITS.explanation };
  }
  // Ids and answer keys come from the editor, not from typing: a stale or tampered form.
  return { code: "unreadable" };
}

/** The schema's findings as issues, each once. */
export function checkIssuesOf(issues: readonly SchemaIssue[]): CheckIssue[] {
  const found: CheckIssue[] = [];
  for (const issue of issues.map(issueOf)) {
    const same = (seen: CheckIssue) =>
      seen.code === issue.code && seen.question === issue.question && seen.option === issue.option;
    if (!found.some(same)) found.push(issue);
  }
  return found;
}

export type ParsedCheck =
  { ok: true; questions: CheckQuestion[] } | { ok: false; issues: CheckIssue[] };

/** The knowledge check as the lesson editor sends it (JSON), validated and cleaned. */
export function parseCheckQuestions(json: string): ParsedCheck {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, issues: [{ code: "unreadable" }] };
  }
  const parsed = checkQuestionsSchema.safeParse(raw);
  return parsed.success
    ? { ok: true, questions: cleanCheckQuestions(parsed.data) }
    : { ok: false, issues: checkIssuesOf(parsed.error.issues) };
}

export type CheckOutcome = "right" | "wrong" | "unanswered";

export function checkOutcome(
  question: CheckQuestion,
  chosen: readonly string[] | undefined,
): CheckOutcome {
  if (!chosen || chosen.length === 0) return "unanswered";
  return isAnswerCorrect(question, chosen) ? "right" : "wrong";
}

/** The learner's answer after ticking (`on`) or unticking an option: one for radios, any for checkboxes. */
export function toggleChoice(
  chosen: readonly string[],
  optionId: string,
  several: boolean,
  on: boolean,
): string[] {
  if (!several) return on ? [optionId] : chosen.filter((id) => id !== optionId);
  if (!on) return chosen.filter((id) => id !== optionId);
  return chosen.includes(optionId) ? [...chosen] : [...chosen, optionId];
}
