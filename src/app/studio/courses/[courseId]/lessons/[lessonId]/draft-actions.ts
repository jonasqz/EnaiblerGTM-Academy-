"use server";

import { z } from "zod";

import { text } from "@/app/studio/form-data";
import { isLocale } from "@/core/i18n/locales";
import { draftErrorText } from "@/core/i18n/studio/helpers";
import type { CheckQuestion } from "@/core/questions/questions";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { authoringModel } from "@/server/authoring/model";
import { draftCheckQuestions } from "@/server/authoring/quiz-drafting";
import { rateLimit } from "@/server/rate-limit";
import { loadLessonEditor } from "@/server/studio/lessons";
import { getStudioText } from "@/server/studio-text";

export type CheckDraftState =
  | { status: "done"; questions: CheckQuestion[]; message: string }
  | { status: "error"; message: string };

const HOUR = 60 * 60_000;
/** A knowledge check is a few questions; the author can ask again for more. */
const DRAFTED_PER_RUN = 3;

/**
 * Practice questions from the lesson as the editor has it, saved or not
 * (core/authoring/quiz-draft). Nothing is saved: the editor adds them to the
 * check, and saving the lesson keeps them.
 */
export async function draftCheckAction(formData: FormData): Promise<CheckDraftState> {
  const courseId = z.uuid().parse(text(formData, "courseId"));
  const lessonId = z.uuid().parse(text(formData, "lessonId"));
  const { tenant } = await requireCapability(
    "courses.edit",
    `/studio/courses/${courseId}/lessons/${lessonId}`,
  );
  const t = await getStudioText();
  const data = await loadLessonEditor(getDb(), tenant.id, lessonId);
  if (!data || data.course.id !== courseId || !isLocale(data.lesson.locale)) {
    throw new Error("Lesson not found");
  }
  const model = authoringModel();
  if (!model) return { status: "error", message: t.t("drafts.noGateway") };
  if (!rateLimit(`check-draft:${tenant.id}`, 30, HOUR)) {
    return { status: "error", message: t.t("drafts.rateLimited") };
  }
  // Only a hint against repeats: anything unreadable is no hint.
  let existing: string[] = [];
  try {
    existing = z
      .array(z.string().max(1_000))
      .max(20)
      .parse(JSON.parse(text(formData, "existing") || "[]"));
  } catch {
    existing = [];
  }
  const result = await draftCheckQuestions(
    getDb(),
    tenant.id,
    {
      courseId,
      lessonId,
      locale: data.lesson.locale,
      title: text(formData, "title") || data.lesson.title,
      markdown: text(formData, "markdown"),
      existing,
      count: DRAFTED_PER_RUN,
    },
    model,
  );
  if (!result.ok) return { status: "error", message: draftErrorText(t, result.error) };
  return {
    status: "done",
    questions: result.questions,
    message: t.n("drafts.check.ready", result.questions.length),
  };
}
