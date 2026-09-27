"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { localized, text } from "@/app/studio/form-data";
import {
  FILE_KINDS,
  formFieldsFromSchema,
  submissionTypesSchema,
  type FileKind,
  type SubmissionType,
} from "@/core/assignments/submission-types";
import { deliveryModeSchema } from "@/core/compliance/delivery-mode";
import {
  describeFinding,
  hasBlockingWording,
  lintLocalizedWording,
  lintWording,
  type WordingContext,
} from "@/core/compliance/wording-lint";
import { isLocale, type Locale, type LocalizedText } from "@/core/i18n/locales";
import { rubricSchema } from "@/core/review/rubric";
import { slugify } from "@/core/shared/slug";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import {
  createCourse,
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
  moveLesson,
  restoreLessonVersion,
  updateLesson,
} from "@/server/studio/lessons";
import { decideSubmission } from "@/server/studio/reviews";

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

/** Wording findings split into blocking errors and warnings (brief §9). */
function wording(checks: Array<[LocalizedText | string, WordingContext]>) {
  const findings = checks.flatMap(([value, context]) =>
    typeof value === "string" ? lintWording(value, context) : lintLocalizedWording(value, context),
  );
  return {
    blocking: hasBlockingWording(findings),
    errors: findings.filter((finding) => finding.severity === "error").map(describeFinding),
    warnings: findings.filter((finding) => finding.severity === "warning").map(describeFinding),
  };
}

function courseLanguages(formData: FormData, allowed: readonly Locale[]): Locale[] {
  const picked = formData.getAll("languages").filter((value): value is Locale => isLocale(value));
  return allowed.filter((locale) => picked.includes(locale));
}

// ---- Courses ---------------------------------------------------------------

export async function createCourseAction(_: FormState, formData: FormData): Promise<FormState> {
  const { tenant } = await requireCapability("courses.edit", "/studio/courses/new");
  const languages = courseLanguages(formData, tenant.settings.locales);
  const parsed = z
    .object({
      title: z.string().min(3, "Give the course a title (at least 3 characters).").max(120),
      artifactName: z.string().min(2, "Name what learners build.").max(80),
      outcome: z
        .string()
        .min(20, "Describe the result in a sentence or two (at least 20 characters).")
        .max(4000),
      deliveryMode: deliveryModeSchema,
    })
    .safeParse({
      title: text(formData, "title"),
      artifactName: text(formData, "artifactName"),
      outcome: text(formData, "outcome"),
      deliveryMode: text(formData, "deliveryMode") || "free_async",
    });
  const errors = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
  if (languages.length === 0) errors.push("Choose at least one course language.");
  if (!parsed.success || errors.length > 0) return { errors };

  const lint = wording([
    [parsed.data.title, "course_title"],
    [parsed.data.artifactName, "artifact_name"],
  ]);
  if (lint.blocking) return { errors: lint.errors };

  const courseId = await createCourse(getDb(), tenant.id, { ...parsed.data, languages });
  revalidatePath("/studio", "layout");
  redirect(`/studio/courses/${courseId}/outcome?created=1`);
}

export async function saveDetailsAction(_: FormState, formData: FormData): Promise<FormState> {
  const courseId = courseIdSchema.parse(text(formData, "courseId"));
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/details`);
  const languages = courseLanguages(formData, tenant.settings.locales);
  const title = localized(formData, "title", languages);
  const summary = localized(formData, "summary", languages);
  const errors: string[] = [];
  if (languages.length === 0) errors.push("Choose at least one course language.");
  if (Object.keys(title).length === 0) errors.push("Add a title in at least one course language.");

  const estText = text(formData, "estMinutes");
  const estMinutes = estText ? Number(estText) : null;
  if (
    estMinutes !== null &&
    (!Number.isInteger(estMinutes) || estMinutes < 1 || estMinutes > 6000)
  ) {
    errors.push("Duration is a whole number of minutes.");
  }
  const plannedLaunch = text(formData, "plannedLaunch") || null;
  if (plannedLaunch && !/^\d{4}-\d{2}(-\d{2})?$/.test(plannedLaunch)) {
    errors.push("Planned launch looks like 2027-01 or 2027-01-15.");
  }
  const deliveryMode = deliveryModeSchema.safeParse(text(formData, "deliveryMode"));
  if (!deliveryMode.success) errors.push("Choose a delivery mode.");
  if (errors.length > 0 || !deliveryMode.success) return { errors };

  const lint = wording([
    [title, "course_title"],
    [summary, "course_description"],
  ]);
  if (lint.blocking) return { errors: lint.errors, warnings: lint.warnings };

  await updateCourseSettings(getDb(), tenant.id, courseId, {
    title,
    summary: Object.keys(summary).length > 0 ? summary : null,
    languages,
    estMinutes,
    deliveryMode: deliveryMode.data,
    plannedLaunch,
    slug: slugify(text(formData, "slug")),
  });
  revalidatePath(`/studio/courses/${courseId}`, "layout");
  return { ok: true, message: "Details saved.", warnings: lint.warnings };
}

const FILE_KIND_FIELDS: Record<FileKind, string> = {
  md: "acceptText",
  pdf: "acceptPdf",
  image: "acceptImage",
};

export async function saveOutcomeAction(_: FormState, formData: FormData): Promise<FormState> {
  const courseId = courseIdSchema.parse(text(formData, "courseId"));
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/outcome`);
  const editor = await loadCourseEditor(getDb(), tenant.id, courseId);
  if (!editor?.assignment) return { errors: ["This course has no assignment."] };
  const languages = editor.course.languages.filter(isLocale);
  const errors: string[] = [];

  const artifactName = localized(formData, "artifactName", languages);
  const prompt = localized(formData, "prompt", languages);
  if (Object.keys(artifactName).length === 0) errors.push("Name what learners build.");
  if (Object.keys(prompt).length === 0) errors.push("Describe the assignment.");

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
        errors.push("The form schema must be an object with string fields (see the example).");
      } else {
        types.push({ type: "template_form", schema });
      }
    } catch {
      errors.push("The form schema is not valid JSON.");
    }
  }
  const submissionTypes = submissionTypesSchema.safeParse(types);
  if (!submissionTypes.success) errors.push("Allow at least one way to hand in the work.");

  let rubricInput: unknown = null;
  try {
    rubricInput = JSON.parse(text(formData, "rubric"));
  } catch {
    errors.push("The rubric could not be read. Reload the page and try again.");
  }
  const rubric = rubricSchema.safeParse(rubricInput);
  if (!rubric.success) {
    errors.push(
      ...rubric.error.issues.map(
        (issue) => `Rubric: ${issue.message} (${issue.path.join(".") || "rubric"})`,
      ),
    );
  }
  if (errors.length > 0 || !rubric.success || !submissionTypes.success) return { errors };

  const lint = wording([
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
  return { ok: true, message: "Outcome and rubric saved.", warnings: lint.warnings };
}

export async function publishCourseAction(formData: FormData): Promise<void> {
  const courseId = courseIdSchema.parse(text(formData, "courseId"));
  const { tenant } = await requireCapability(
    "courses.publish",
    `/studio/courses/${courseId}/publish`,
  );
  const check = await publishCourse(getDb(), tenant.id, courseId, {
    legalLinks: tenant.settings.legal_links,
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
  const title = (text(formData, "title") || (translationOf ? "" : "Untitled lesson")).slice(0, 160);
  const source = translationOf
    ? editor.lessons.find((lesson) => lesson.key === translationOf)
    : undefined;
  const lessonId = await createLesson(getDb(), tenant.id, courseId, {
    locale,
    title: title || source?.title || "Untitled lesson",
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
  const editor = await loadLessonEditor(getDb(), tenant.id, lessonId);
  if (!editor) return { errors: ["This lesson no longer exists."] };
  const title = text(formData, "title");
  const markdown = String(formData.get("markdown") ?? "").replace(/\r\n/g, "\n");
  const errors: string[] = [];
  if (!title) errors.push("A lesson needs a title.");
  if (title.length > 160) errors.push("Keep the title under 160 characters.");
  if (markdown.length > 100_000) errors.push("This lesson is very long; split it into two.");
  if (errors.length > 0) return { errors };

  const known = new Set(
    editor.rubric
      ? rubricSchema.parse(editor.rubric.definition).criteria.map((criterion) => criterion.id)
      : [],
  );
  const criterionIds = formData
    .getAll("criteria")
    .filter((value): value is string => typeof value === "string" && known.has(value));
  const result = await updateLesson(getDb(), tenant.id, lessonId, {
    title,
    markdown,
    criterionIds,
    userId: viewer.userId,
  });
  revalidatePath(`/studio/courses/${editor.course.id}`, "layout");
  const lint = wording([
    [title, "lesson_text"],
    [markdown, "lesson_text"],
  ]);
  return {
    ok: true,
    message: result.changed ? `Saved as version ${result.version}.` : "No changes to save.",
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

const DECISION_ERRORS: Record<string, string> = {
  not_found: "This submission no longer exists.",
  reason_required: "Your verdict differs from the AI review: add a reason for the record.",
};

export async function decideReviewAction(_: FormState, formData: FormData): Promise<FormState> {
  const submissionId = z.uuid().parse(text(formData, "submissionId"));
  const { tenant, viewer } = await requireCapability(
    "reviews.decide",
    `/studio/reviews/${submissionId}`,
  );
  const scores: Record<string, number> = {};
  const feedback: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (name.startsWith("score.") && value !== "") scores[name.slice(6)] = Number(value);
    if (name.startsWith("feedback.")) feedback[name.slice(9)] = value.slice(0, 2000);
  }
  const result = await decideSubmission(getDb(), tenant, viewer.userId, submissionId, {
    scores,
    feedback,
    summary: text(formData, "summary").slice(0, 2000),
    reason: text(formData, "reason").slice(0, 1000) || null,
  });
  if (!result.ok) {
    const message = result.error.startsWith("score:")
      ? `Score every criterion (missing: ${result.error.slice(6)}).`
      : (DECISION_ERRORS[result.error] ?? "The decision could not be saved.");
    return { errors: [message] };
  }
  revalidatePath("/studio", "layout");
  redirect(`/studio/reviews?decided=${result.pass ? "pass" : "revise"}`);
}
