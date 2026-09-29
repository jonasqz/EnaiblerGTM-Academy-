"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { localized, text, wording } from "@/app/studio/form-data";
import {
  FILE_KINDS,
  formFieldsFromSchema,
  submissionTypesSchema,
  type FileKind,
  type SubmissionType,
} from "@/core/assignments/submission-types";
import { deliveryModeSchema } from "@/core/compliance/delivery-mode";
import { COMPLETION_MODES, requiresWork } from "@/core/courses/completion";
import { isLocale, type Locale } from "@/core/i18n/locales";
import { checkIssueText, publishIssueText } from "@/core/i18n/studio/helpers";
import { parseCheckQuestions } from "@/core/questions/knowledge-check";
import { questionTexts } from "@/core/questions/questions";
import { rubricSchema } from "@/core/review/rubric";
import { slugify } from "@/core/shared/slug";
import { getDb } from "@/db/client";
import { requireCapability, reviewScopeOf } from "@/server/access";
import {
  createCourse,
  endingIssues,
  loadCourseEditor,
  publishCourse,
  unpublishCourse,
  updateCourseSettings,
  updateOutcome,
} from "@/server/studio/courses";
import {
  createLesson,
  deleteLesson,
  loadLessonEditor,
  markLessonReviewed,
  moveLesson,
  restoreLessonVersion,
  setLessonSources,
  updateLesson,
} from "@/server/studio/lessons";
import { decideSubmission } from "@/server/studio/reviews";
import { getStudioText } from "@/server/studio-text";

/*
 * Studio actions. Every action re-checks the capability (a form can be posted
 * without the page) and takes the academy from the host, never from the form.
 */

export interface FormState {
  ok?: boolean;
  message?: string;
  errors?: string[];
  warnings?: string[];
}

const courseIdSchema = z.uuid();

function courseLanguages(formData: FormData, allowed: readonly Locale[]): Locale[] {
  const picked = formData.getAll("languages").filter((value): value is Locale => isLocale(value));
  return allowed.filter((locale) => picked.includes(locale));
}

// ---- Courses ---------------------------------------------------------------

export async function createCourseAction(_: FormState, formData: FormData): Promise<FormState> {
  const { tenant } = await requireCapability("courses.edit", "/studio/courses/new");
  const t = await getStudioText();
  const languages = courseLanguages(formData, tenant.settings.locales);
  const completionMode = z
    .enum(COMPLETION_MODES, t.t("courses.completion.choose"))
    .safeParse(text(formData, "completionMode") || "work");
  const parsed = z
    .strictObject({
      title: z.string().min(3, t.t("common.actions.titleMin")).max(120),
      deliveryMode: deliveryModeSchema,
    })
    .safeParse({
      title: text(formData, "title"),
      deliveryMode: text(formData, "deliveryMode") || "free_async",
    });
  // A test-only course has no artifact: the form leaves those fields out.
  const work =
    completionMode.success && !requiresWork(completionMode.data)
      ? null
      : z
          .strictObject({
            artifactName: z.string().min(2, t.t("common.actions.artifactMin")).max(80),
            outcome: z.string().min(20, t.t("common.actions.outcomeMin")).max(4000),
          })
          .safeParse({
            artifactName: text(formData, "artifactName"),
            outcome: text(formData, "outcome"),
          });
  const errors = [completionMode, parsed, work].flatMap((result) =>
    result && !result.success ? result.error.issues.map((issue) => issue.message) : [],
  );
  if (languages.length === 0) errors.push(t.t("common.actions.chooseLanguage"));
  if (!completionMode.success || !parsed.success || work?.success === false || errors.length > 0)
    return { errors };

  const lint = wording(
    t,
    work
      ? [
          [parsed.data.title, "course_title"],
          [work.data.artifactName, "artifact_name"],
        ]
      : [[parsed.data.title, "course_title"]],
  );
  if (lint.blocking) return { errors: lint.errors };

  const courseId = await createCourse(getDb(), tenant.id, {
    ...parsed.data,
    ...work?.data,
    completionMode: completionMode.data,
    languages,
  });
  revalidatePath("/studio", "layout");
  // Straight to the first build step: the outcome for work, the questions for a test.
  redirect(`/studio/courses/${courseId}/${work ? "outcome" : "test"}?created=1`);
}

export async function saveDetailsAction(_: FormState, formData: FormData): Promise<FormState> {
  const courseId = courseIdSchema.parse(text(formData, "courseId"));
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/details`);
  const t = await getStudioText();
  const languages = courseLanguages(formData, tenant.settings.locales);
  const title = localized(formData, "title", languages);
  const summary = localized(formData, "summary", languages);
  const errors: string[] = [];
  if (languages.length === 0) errors.push(t.t("common.actions.chooseLanguage"));
  if (Object.keys(title).length === 0) errors.push(t.t("common.actions.titleOneLanguage"));

  const estText = text(formData, "estMinutes");
  const estMinutes = estText ? Number(estText) : null;
  if (
    estMinutes !== null &&
    (!Number.isInteger(estMinutes) || estMinutes < 1 || estMinutes > 6000)
  ) {
    errors.push(t.t("common.actions.durationWhole"));
  }
  const plannedLaunch = text(formData, "plannedLaunch") || null;
  if (plannedLaunch && !/^\d{4}-\d{2}(-\d{2})?$/.test(plannedLaunch)) {
    errors.push(t.t("common.actions.launchFormat"));
  }
  const deliveryMode = deliveryModeSchema.safeParse(text(formData, "deliveryMode"));
  if (!deliveryMode.success) errors.push(t.t("common.actions.chooseDeliveryMode"));
  const completionMode = z.enum(COMPLETION_MODES).safeParse(text(formData, "completionMode"));
  if (!completionMode.success) errors.push(t.t("courses.completion.choose"));
  if (errors.length > 0 || !deliveryMode.success || !completionMode.success) return { errors };

  const lint = wording(t, [
    [title, "course_title"],
    [summary, "course_description"],
  ]);
  if (lint.blocking) return { errors: lint.errors, warnings: lint.warnings };

  const editor = await loadCourseEditor(getDb(), tenant.id, courseId);
  if (!editor) return { errors: [t.t("common.actions.courseGone")] };
  if (
    editor.course.status === "published" &&
    completionMode.data !== editor.course.completionMode
  ) {
    const missing = endingIssues(editor, completionMode.data);
    if (missing.length > 0) {
      return {
        errors: [
          t.t("courses.completion.liveNotReady"),
          ...missing.map((issue) => publishIssueText(t, issue)),
        ],
      };
    }
  }

  const change = await updateCourseSettings(getDb(), tenant, courseId, {
    title,
    summary: Object.keys(summary).length > 0 ? summary : null,
    languages,
    estMinutes,
    deliveryMode: deliveryMode.data,
    plannedLaunch,
    slug: slugify(text(formData, "slug")),
    completionMode: completionMode.data,
  });
  revalidatePath(`/studio/courses/${courseId}`, "layout");
  // Say what the new ending brought along, so nothing appears unexplained in the tabs.
  const message = [
    t.t("common.actions.detailsSaved"),
    ...(change.added.assignment ? [t.t("courses.completion.addedWork")] : []),
    ...(change.added.test ? [t.t("courses.completion.addedTest")] : []),
    ...(change.completed > 0 ? [t.n("courses.completion.completed", change.completed)] : []),
  ].join(" ");
  return { ok: true, message, warnings: lint.warnings };
}

const FILE_KIND_FIELDS: Record<FileKind, string> = {
  md: "acceptText",
  pdf: "acceptPdf",
  image: "acceptImage",
};

export async function saveOutcomeAction(_: FormState, formData: FormData): Promise<FormState> {
  const courseId = courseIdSchema.parse(text(formData, "courseId"));
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/outcome`);
  const t = await getStudioText();
  const editor = await loadCourseEditor(getDb(), tenant.id, courseId);
  if (!editor?.assignment) return { errors: [t.t("common.actions.noAssignment")] };
  const languages = editor.course.languages.filter(isLocale);
  const errors: string[] = [];

  const artifactName = localized(formData, "artifactName", languages);
  const prompt = localized(formData, "prompt", languages);
  if (Object.keys(artifactName).length === 0) errors.push(t.t("common.actions.artifactMin"));
  if (Object.keys(prompt).length === 0) errors.push(t.t("common.actions.describeAssignment"));

  const kinds = FILE_KINDS.filter((kind) => formData.get(FILE_KIND_FIELDS[kind]) === "on");
  const maxMb = Number(text(formData, "maxMb"));
  const types: SubmissionType[] = [];
  if (kinds.length > 0) {
    types.push({
      type: "file",
      accept: kinds,
      max_mb: Number.isInteger(maxMb) && maxMb >= 1 && maxMb <= 50 ? maxMb : 15,
    });
  }
  if (formData.get("acceptUrl") === "on") types.push({ type: "url" });
  if (formData.get("acceptForm") === "on") {
    try {
      const schema = JSON.parse(text(formData, "formSchema")) as Record<string, unknown>;
      if (!formFieldsFromSchema(schema)) {
        errors.push(t.t("common.actions.formSchemaShape"));
      } else {
        types.push({ type: "template_form", schema });
      }
    } catch {
      errors.push(t.t("common.actions.formSchemaJson"));
    }
  }
  const submissionTypes = submissionTypesSchema.safeParse(types);
  if (!submissionTypes.success) errors.push(t.t("common.actions.oneWayToHandIn"));

  let rubricInput: unknown = null;
  try {
    rubricInput = JSON.parse(text(formData, "rubric"));
  } catch {
    errors.push(t.t("common.actions.rubricUnreadable"));
  }
  const rubric = rubricSchema.safeParse(rubricInput);
  if (!rubric.success) {
    errors.push(
      ...rubric.error.issues.map((issue) =>
        t.t("common.actions.rubricIssue", {
          message: issue.message,
          path: issue.path.join(".") || "rubric",
        }),
      ),
    );
  }
  if (errors.length > 0 || !rubric.success || !submissionTypes.success) return { errors };

  const lint = wording(t, [
    [artifactName, "artifact_name"],
    [prompt, "assignment_prompt"],
  ]);
  if (lint.blocking) return { errors: lint.errors, warnings: lint.warnings };

  await updateOutcome(getDb(), tenant.id, courseId, {
    prompt,
    artifactName,
    submissionTypes: submissionTypes.data,
    rubric: rubric.data,
  });
  revalidatePath(`/studio/courses/${courseId}`, "layout");
  return { ok: true, message: t.t("common.actions.outcomeSaved"), warnings: lint.warnings };
}

export async function publishCourseAction(formData: FormData): Promise<void> {
  const courseId = courseIdSchema.parse(text(formData, "courseId"));
  const { tenant } = await requireCapability(
    "courses.publish",
    `/studio/courses/${courseId}/publish`,
  );
  const check = await publishCourse(getDb(), tenant.id, courseId, {
    legalLinks: tenant.settings.legal_links,
    aiReview: tenant.settings.features.ai_review,
  });
  revalidatePath("/", "layout");
  redirect(`/studio/courses/${courseId}/publish?${check.ok ? "published=1" : "blocked=1"}`);
}

export async function unpublishCourseAction(formData: FormData): Promise<void> {
  const courseId = courseIdSchema.parse(text(formData, "courseId"));
  const { tenant } = await requireCapability(
    "courses.publish",
    `/studio/courses/${courseId}/publish`,
  );
  await unpublishCourse(getDb(), tenant.id, courseId);
  revalidatePath("/", "layout");
  redirect(`/studio/courses/${courseId}/publish?unpublished=1`);
}

// ---- Lessons ---------------------------------------------------------------

export async function createLessonAction(formData: FormData): Promise<void> {
  const courseId = courseIdSchema.parse(text(formData, "courseId"));
  const { tenant, viewer } = await requireCapability(
    "courses.edit",
    `/studio/courses/${courseId}/lessons`,
  );
  const editor = await loadCourseEditor(getDb(), tenant.id, courseId);
  const locale = text(formData, "locale");
  if (!editor || !isLocale(locale) || !editor.course.languages.includes(locale)) {
    redirect(`/studio/courses/${courseId}/lessons?error=language`);
  }
  const translationOf = text(formData, "translationOf") || undefined;
  const untitled = (await getStudioText()).t("common.actions.untitledLesson");
  const title = (text(formData, "title") || (translationOf ? "" : untitled)).slice(0, 160);
  const source = translationOf
    ? editor.lessons.find((lesson) => lesson.key === translationOf)
    : undefined;
  const lessonId = await createLesson(getDb(), tenant.id, courseId, {
    locale,
    title: title || source?.title || untitled,
    translationOf,
    userId: viewer.userId,
  });
  revalidatePath(`/studio/courses/${courseId}`, "layout");
  redirect(
    `/studio/courses/${courseId}/lessons/${lessonId}${translationOf ? "?translation=1" : ""}`,
  );
}

export async function saveLessonAction(_: FormState, formData: FormData): Promise<FormState> {
  const lessonId = z.uuid().parse(text(formData, "lessonId"));
  const { tenant, viewer } = await requireCapability("courses.edit");
  const t = await getStudioText();
  const editor = await loadLessonEditor(getDb(), tenant.id, lessonId);
  if (!editor) return { errors: [t.t("common.actions.lessonGone")] };
  const title = text(formData, "title");
  const markdown = String(formData.get("markdown") ?? "").replace(/\r\n/g, "\n");
  // The editor always sends its knowledge check (JSON); a form without one leaves it as it is.
  const check = formData.has("questions") ? parseCheckQuestions(text(formData, "questions")) : null;
  const errors: string[] = [];
  if (!title) errors.push(t.t("common.actions.lessonTitleRequired"));
  if (title.length > 160) errors.push(t.t("common.actions.lessonTitleLong"));
  if (markdown.length > 100_000) errors.push(t.t("common.actions.lessonLong"));
  if (check && !check.ok) errors.push(...check.issues.map((issue) => checkIssueText(t, issue)));
  if (errors.length > 0) return { errors };
  const questions = check?.ok ? check.questions : undefined;

  const known = new Set(
    editor.rubric
      ? rubricSchema.parse(editor.rubric.definition).criteria.map((criterion) => criterion.id)
      : [],
  );
  const criterionIds = formData
    .getAll("criteria")
    .filter((value): value is string => typeof value === "string" && known.has(value));
  // The editor sends its video choice ("" for none); a form without the field leaves it as it is.
  const mediaAssetId = formData.has("mediaAssetId") ? text(formData, "mediaAssetId") : null;
  const result = await updateLesson(getDb(), tenant.id, lessonId, {
    title,
    markdown,
    criterionIds,
    questions,
    mediaAssetIds: mediaAssetId === null ? undefined : mediaAssetId ? [mediaAssetId] : [],
    userId: viewer.userId,
  });
  revalidatePath(`/studio/courses/${editor.course.id}`, "layout");
  const lint = wording(t, [
    [title, "lesson_text"],
    [markdown, "lesson_text"],
    ...(questions ?? []).map((question): [string, "lesson_text"] => [
      questionTexts(question).join("\n"),
      "lesson_text",
    ]),
  ]);
  return {
    ok: true,
    message: result.changed
      ? t.t("common.actions.savedVersion", { version: result.version })
      : t.t("common.actions.noChanges"),
    warnings: lint.warnings,
  };
}

export async function restoreLessonVersionAction(formData: FormData): Promise<void> {
  const lessonId = z.uuid().parse(text(formData, "lessonId"));
  const version = z.coerce.number().int().positive().parse(text(formData, "version"));
  const { tenant, viewer } = await requireCapability("courses.edit");
  const editor = await loadLessonEditor(getDb(), tenant.id, lessonId);
  if (!editor) redirect("/studio/courses");
  const result = await restoreLessonVersion(getDb(), tenant.id, lessonId, version, viewer.userId);
  revalidatePath(`/studio/courses/${editor.course.id}`, "layout");
  // `v` remounts the editor with the restored text (see the lesson page).
  redirect(
    `/studio/courses/${editor.course.id}/lessons/${lessonId}?restored=${version}&v=${result.version}`,
  );
}

export async function markLessonReviewedAction(formData: FormData): Promise<void> {
  const lessonId = z.uuid().parse(text(formData, "lessonId"));
  const { tenant } = await requireCapability("courses.edit");
  const editor = await loadLessonEditor(getDb(), tenant.id, lessonId);
  if (!editor) redirect("/studio/courses");
  await markLessonReviewed(getDb(), tenant.id, lessonId);
  revalidatePath(`/studio/courses/${editor.course.id}`, "layout");
  revalidatePath("/studio");
}

export async function setLessonSourcesAction(formData: FormData): Promise<void> {
  const lessonId = z.uuid().parse(text(formData, "lessonId"));
  const { tenant } = await requireCapability("courses.edit");
  const editor = await loadLessonEditor(getDb(), tenant.id, lessonId);
  if (!editor) redirect("/studio/courses");
  await setLessonSources(getDb(), tenant.id, lessonId, formData.getAll("sourceId").map(String));
  revalidatePath(`/studio/courses/${editor.course.id}`, "layout");
}

export async function moveLessonAction(formData: FormData): Promise<void> {
  const courseId = courseIdSchema.parse(text(formData, "courseId"));
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/lessons`);
  const direction = text(formData, "direction") === "up" ? "up" : "down";
  await moveLesson(getDb(), tenant.id, courseId, text(formData, "key"), direction);
  revalidatePath(`/studio/courses/${courseId}`, "layout");
}

export async function deleteLessonAction(formData: FormData): Promise<void> {
  const courseId = courseIdSchema.parse(text(formData, "courseId"));
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/lessons`);
  await deleteLesson(getDb(), tenant.id, courseId, text(formData, "key"));
  revalidatePath(`/studio/courses/${courseId}`, "layout");
  redirect(`/studio/courses/${courseId}/lessons`);
}

// ---- Reviews ---------------------------------------------------------------

export async function decideReviewAction(_: FormState, formData: FormData): Promise<FormState> {
  const submissionId = z.uuid().parse(text(formData, "submissionId"));
  const session = await requireCapability("reviews.decide", `/studio/reviews/${submissionId}`);
  const { tenant, viewer } = session;
  const t = await getStudioText();
  const scores: Record<string, number> = {};
  const feedback: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (name.startsWith("score.") && value !== "") scores[name.slice(6)] = Number(value);
    if (name.startsWith("feedback.")) feedback[name.slice(9)] = value.slice(0, 2000);
  }
  const result = await decideSubmission(
    getDb(),
    tenant,
    viewer.userId,
    submissionId,
    {
      scores,
      feedback,
      summary: text(formData, "summary").slice(0, 2000),
      reason: text(formData, "reason").slice(0, 1000) || null,
    },
    reviewScopeOf(session),
  );
  if (!result.ok) {
    const message = result.error.startsWith("score:")
      ? t.t("common.actions.scoreEvery", { missing: result.error.slice(6) })
      : result.error === "not_found"
        ? t.t("common.actions.submissionGone")
        : result.error === "reason_required"
          ? t.t("common.actions.reasonRequired")
          : t.t("common.actions.decisionFailed");
    return { errors: [message] };
  }
  revalidatePath("/studio", "layout");
  redirect(`/studio/reviews?decided=${result.pass ? "pass" : "revise"}`);
}
