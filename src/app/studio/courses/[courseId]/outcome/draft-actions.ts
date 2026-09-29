"use server";

import { z } from "zod";

import { localized, text } from "@/app/studio/form-data";
import { isLocale, localize, type LocalizedText } from "@/core/i18n/locales";
import { draftErrorText } from "@/core/i18n/studio/helpers";
import type { Rubric } from "@/core/review/rubric";
import { AiAllowanceUsedUp, allowanceResetsAt } from "@/core/usage/allowance";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { draftAssignmentFromSources } from "@/server/authoring/assignment-drafting";
import { authoringModel, meteredModel } from "@/server/authoring/model";
import { draftRubric } from "@/server/authoring/rubric";
import { fileBytes, loadFile } from "@/server/files";
import { rateLimit } from "@/server/rate-limit";
import { getCourseEditor } from "@/server/studio/course-context";
import { getStudioText } from "@/server/studio-text";
import { documentText } from "@/server/text-extract";

export type RubricDraftState =
  | { status: "done"; rubric: Rubric; notes: string[]; example: string }
  | { status: "error"; message: string };

export type AssignmentDraftState =
  | {
      status: "done";
      artifactName: LocalizedText;
      prompt: LocalizedText;
      rubric: Rubric;
      notes: string[];
    }
  | { status: "error"; message: string };

const HOUR = 60 * 60_000;

/**
 * Drafts the assignment and its rubric from the course's sources
 * (core/authoring/assignment-draft), starting from what the author typed.
 * Nothing is saved: the outcome form shows the draft for the author to change.
 */
export async function draftAssignmentAction(formData: FormData): Promise<AssignmentDraftState> {
  const courseId = z.uuid().parse(text(formData, "courseId"));
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/outcome`);
  const t = await getStudioText();
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor?.assignment) return { status: "error", message: t.t("common.actions.noAssignment") };
  const model = authoringModel();
  if (!model) return { status: "error", message: t.t("drafts.noGateway") };
  // One hourly budget with the rubric drafts: both draft the same thing.
  if (!rateLimit(`rubric-draft:${tenant.id}`, 20, HOUR)) {
    return { status: "error", message: t.t("authoring.draft.rateLimited") };
  }
  const languages = editor.course.languages.filter(isLocale);
  const primary = languages[0];
  if (!primary) return { status: "error", message: t.t("common.actions.noAssignment") };
  const result = await draftAssignmentFromSources(
    getDb(),
    tenant.id,
    courseId,
    {
      languages,
      courseTitle: localize(editor.course.title, primary, languages),
      current: {
        artifactName: text(formData, `artifactName.${primary}`),
        prompt: text(formData, `prompt.${primary}`),
      },
    },
    model,
  );
  if (!result.ok) return { status: "error", message: draftErrorText(t, result.error) };
  return {
    status: "done",
    artifactName: result.artifactName,
    prompt: result.prompt,
    rubric: result.rubric,
    notes: result.notes,
  };
}

/**
 * Drafts a rubric from the outcome as currently typed (saved or not) and an
 * optional example of good work, pasted or uploaded. Nothing is saved: the
 * draft goes into the editor for the author to change.
 */
export async function draftRubricAction(formData: FormData): Promise<RubricDraftState> {
  const courseId = z.uuid().parse(text(formData, "courseId"));
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/outcome`);
  const t = await getStudioText();
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor?.assignment) return { status: "error", message: t.t("common.actions.noAssignment") };
  const model = authoringModel();
  if (!model) {
    return { status: "error", message: t.t("authoring.draft.noGateway") };
  }
  if (!rateLimit(`rubric-draft:${tenant.id}`, 20, HOUR)) {
    return { status: "error", message: t.t("authoring.draft.rateLimited") };
  }

  const languages = editor.course.languages.filter(isLocale);
  const artifactName = localized(formData, "artifactName", languages);
  const prompt = localized(formData, "prompt", languages);
  let example = text(formData, "example");
  const exampleFile = text(formData, "exampleFile");
  if (exampleFile) {
    const record = await loadFile(getDb(), tenant.id, exampleFile);
    if (record?.purpose === "exemplar") {
      example = (await documentText(await fileBytes(record), record.contentType)) || example;
    }
  }

  try {
    const result = await draftRubric(
      meteredModel(getDb(), model, { tenantId: tenant.id, kind: "rubric_draft", courseId }),
      {
        languages,
        artifactName: Object.keys(artifactName).length
          ? artifactName
          : editor.assignment.artifactName,
        prompt: Object.keys(prompt).length ? prompt : editor.assignment.prompt,
        example,
      },
      { tenant: tenant.slug, course: courseId },
    );
    if (!result.ok) {
      return { status: "error", message: t.t("authoring.draft.unusable") };
    }
    return {
      status: "done",
      rubric: result.rubric,
      notes: result.notes,
      example: example.slice(0, 40_000),
    };
  } catch (error) {
    if (error instanceof AiAllowanceUsedUp) {
      const date = t.date(allowanceResetsAt());
      return { status: "error", message: t.t("authoring.draft.allowance", { date }) };
    }
    console.error("[authoring] rubric draft failed", error);
    return { status: "error", message: t.t("authoring.draft.noAnswer") };
  }
}
