import { randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";

import type { JobError } from "@/core/authoring/job-errors";
import {
  buildCheckDraftPrompt,
  buildQuizDraftPrompt,
  CHECK_DRAFT_JSON_SCHEMA,
  CHECK_DRAFT_PROMPT_VERSION,
  MAX_DRAFTED_QUESTIONS,
  parseCheckDraft,
  parseQuizDraft,
  QUIZ_DRAFT_PROMPT_VERSION,
  quizDraftJsonSchema,
} from "@/core/authoring/quiz-draft";
import { sectionLabel, sectionsWithinBudget } from "@/core/authoring/sections";
import { isLocale, localize, type Locale } from "@/core/i18n/locales";
import { QUESTION_LIMITS, type CheckQuestion, type TestQuestion } from "@/core/questions/questions";
import type { Database } from "@/db/client";
import { courses, courseTests, lessons } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { askForJson, draftFailure, loadSourceSections } from "@/server/authoring/drafting";
import { meteredModel, type AuthoringModel } from "@/server/authoring/model";
import { markdownOf } from "@/server/studio/lessons";

/*
 * Question drafts (webinar brief §2.1): final-test questions from the
 * course's sources and lessons, and practice questions for one lesson.
 * Nothing is saved here: the drafts go back to the editor, and only the
 * author's save puts them in the test or the lesson.
 */

const SECTION_BUDGET = { total: 40_000, each: 2_000 };
const LESSON_BUDGET = 20_000;

/** Short ids like the editors make, unique within a test. */
const shortId = () => randomUUID().slice(0, 8);

export type TestDraftResult =
  { ok: true; questions: TestQuestion[]; notes: string[] } | { ok: false; error: JobError };

export async function draftTestQuestions(
  db: Database,
  tenantId: string,
  courseId: string,
  input: { count: number },
  model: AuthoringModel | null,
): Promise<TestDraftResult> {
  if (!model) return { ok: false, error: "gateway_missing" };
  const context = await withTenant(db, tenantId, async (tx) => {
    const [course] = await tx.select().from(courses).where(eq(courses.id, courseId));
    if (!course) return null;
    const [test] = await tx.select().from(courseTests).where(eq(courseTests.courseId, courseId));
    const languages = course.languages.filter(isLocale);
    const lessonRows = await tx
      .select({ title: lessons.title, blocks: lessons.blocks })
      .from(lessons)
      .where(and(eq(lessons.courseId, courseId), eq(lessons.locale, languages[0] ?? "")))
      .orderBy(asc(lessons.position));
    return { course, languages, questions: test?.questions ?? [], lessonRows };
  });
  if (!context || context.languages.length === 0) return { ok: false, error: "no_sources" };
  const { course, languages } = context;
  const room = QUESTION_LIMITS.testQuestions - context.questions.length;
  const count = Math.max(0, Math.min(input.count, MAX_DRAFTED_QUESTIONS, room));
  if (count === 0) return { ok: true, questions: [], notes: [] };

  const sections = sectionsWithinBudget(
    await loadSourceSections(db, tenantId, courseId),
    SECTION_BUDGET,
  ).map((section, index) => ({
    ref: `C${index + 1}`,
    label: sectionLabel(section),
    text: section.text,
  }));
  let lessonBudget = LESSON_BUDGET;
  const lessonTexts = context.lessonRows.flatMap((row) => {
    const text = markdownOf(row.blocks).slice(0, Math.max(0, lessonBudget));
    lessonBudget -= text.length;
    return text.trim() ? [{ title: row.title, text }] : [];
  });
  if (sections.length === 0 && lessonTexts.length === 0) return { ok: false, error: "no_sources" };

  const existing = context.questions.map((question) => localize(question.prompt, languages[0]!));
  try {
    const drafted = await askForJson(
      meteredModel(db, model, { tenantId, kind: "question_draft", courseId }),
      {
        prompt: buildQuizDraftPrompt({
          languages,
          count,
          courseTitle: localize(course.title, languages[0]!),
          sections,
          lessons: lessonTexts,
          existing,
          nonce: randomUUID(),
        }),
        jsonSchema: quizDraftJsonSchema(languages),
        purpose: "quiz-draft",
        promptVersion: QUIZ_DRAFT_PROMPT_VERSION,
        temperature: 0.4,
        maxTokens: 12_000,
        parse: (content) =>
          parseQuizDraft(content, {
            languages,
            count,
            sections: new Map(sections.map((section) => [section.ref, section.label])),
            existing,
            makeId: shortId,
          }),
      },
    );
    return drafted ? { ok: true, ...drafted } : { ok: false, error: "invalid_drafts" };
  } catch (error) {
    return { ok: false, error: draftFailure(error, "quiz-draft") };
  }
}

export type CheckDraftResult =
  { ok: true; questions: CheckQuestion[] } | { ok: false; error: JobError };

/** Practice questions for a lesson, from its text as the author has it (saved or not). */
export async function draftCheckQuestions(
  db: Database,
  tenantId: string,
  input: {
    courseId: string;
    lessonId: string;
    locale: Locale;
    title: string;
    markdown: string;
    existing: readonly string[];
    count: number;
  },
  model: AuthoringModel | null,
): Promise<CheckDraftResult> {
  if (!model) return { ok: false, error: "gateway_missing" };
  // Too little to ask about: the lesson has to teach something first.
  if (input.markdown.trim().length < 200) return { ok: false, error: "no_lesson_text" };
  const count = Math.max(
    0,
    Math.min(input.count, QUESTION_LIMITS.checkQuestions - input.existing.length),
  );
  if (count === 0) return { ok: true, questions: [] };
  try {
    const drafted = await askForJson(
      meteredModel(db, model, {
        tenantId,
        kind: "question_draft",
        courseId: input.courseId,
        refId: input.lessonId,
      }),
      {
        prompt: buildCheckDraftPrompt({
          locale: input.locale,
          count,
          lessonTitle: input.title,
          markdown: input.markdown,
          existing: input.existing,
          nonce: randomUUID(),
        }),
        jsonSchema: { ...CHECK_DRAFT_JSON_SCHEMA, schema: { ...CHECK_DRAFT_JSON_SCHEMA.schema } },
        purpose: "check-draft",
        promptVersion: CHECK_DRAFT_PROMPT_VERSION,
        temperature: 0.4,
        maxTokens: 4_000,
        parse: (content) =>
          parseCheckDraft(content, { count, existing: input.existing, makeId: shortId }),
      },
    );
    return drafted ? { ok: true, questions: drafted } : { ok: false, error: "invalid_drafts" };
  } catch (error) {
    return { ok: false, error: draftFailure(error, "check-draft") };
  }
}
