"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { FormState } from "@/app/studio/actions";
import { text, wording } from "@/app/studio/form-data";
import type { WordingContext } from "@/core/compliance/wording-lint";
import type { LocalizedText } from "@/core/i18n/locales";
import type { StudioText } from "@/core/i18n/studio/translator";
import { courseTestSchema, QUESTION_LIMITS, testQuestionTexts } from "@/core/questions/questions";
import {
  cleanTestDraft,
  sameTestIssue,
  testIssueOf,
  type TestIssue,
} from "@/core/questions/test-editing";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { loadCourseEditor } from "@/server/studio/courses";
import { saveCourseTest } from "@/server/studio/tests";
import { getStudioText } from "@/server/studio-text";

function issueText(t: StudioText, issue: TestIssue, questionCount: number): string {
  const vars = { question: issue.question, option: issue.option };
  switch (issue.code) {
    case "explanation_too_long":
      return t.t("courses.test.issue.explanation_too_long", {
        ...vars,
        max: QUESTION_LIMITS.explanation,
      });
    case "pool_size":
      return t.t("courses.test.issue.pool_size", { max: QUESTION_LIMITS.testQuestions });
    case "pool_too_large":
      return t.t("courses.test.issue.pool_too_large", { count: questionCount });
    case "max_attempts":
      return t.t("courses.test.issue.max_attempts", { max: QUESTION_LIMITS.maxAttempts });
    case "too_many_questions":
      return t.t("courses.test.issue.too_many_questions", { max: QUESTION_LIMITS.testQuestions });
    case "question_too_long":
      return t.t("courses.test.issue.question_too_long", { ...vars, max: QUESTION_LIMITS.prompt });
    case "option_too_long":
      return t.t("courses.test.issue.option_too_long", { ...vars, max: QUESTION_LIMITS.option });
    case "too_few_options":
      return t.t("courses.test.issue.too_few_options", {
        ...vars,
        min: QUESTION_LIMITS.minOptions,
      });
    case "too_many_options":
      return t.t("courses.test.issue.too_many_options", {
        ...vars,
        max: QUESTION_LIMITS.maxOptions,
      });
    case "invalid":
      return t.t("courses.test.issue.invalid", { path: issue.path });
    default:
      return t.t(`courses.test.issue.${issue.code}`, vars);
  }
}

/** Saves the final test; the editor posts its draft as JSON in `test`. */
export async function saveTestAction(_: FormState, formData: FormData): Promise<FormState> {
  const courseId = z.uuid().parse(text(formData, "courseId"));
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/test`);
  const t = await getStudioText();
  const editor = await loadCourseEditor(getDb(), tenant.id, courseId);
  if (!editor) return { errors: [t.t("courses.test.gone")] };

  let draft: unknown;
  try {
    draft = JSON.parse(String(formData.get("test") ?? ""));
  } catch {
    return { errors: [t.t("courses.test.unreadable")] };
  }
  const parsed = courseTestSchema.safeParse(cleanTestDraft(draft));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(testIssueOf)
      .filter(
        (issue, index, all) => all.findIndex((other) => sameTestIssue(issue, other)) === index,
      );
    const count = Array.isArray((draft as { questions?: unknown })?.questions)
      ? (draft as { questions: unknown[] }).questions.length
      : 0;
    return { errors: issues.map((issue) => issueText(t, issue, count)) };
  }

  const result = await saveCourseTest(getDb(), tenant.id, courseId, parsed.data);
  revalidatePath(`/studio/courses/${courseId}`, "layout");
  const lint = wording(
    t,
    parsed.data.questions.flatMap((question) =>
      testQuestionTexts(question).map((value): [LocalizedText, WordingContext] => [
        value,
        "test_question",
      ]),
    ),
  );
  return {
    ok: true,
    message: result.changed
      ? t.t("common.actions.savedVersion", { version: result.version })
      : t.t("common.actions.noChanges"),
    warnings: [...new Set(lint.warnings)],
  };
}
