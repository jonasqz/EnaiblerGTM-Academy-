"use server";

import { z } from "zod";

import { localized, text } from "@/app/studio/form-data";
import { isLocale } from "@/core/i18n/locales";
import type { Rubric } from "@/core/review/rubric";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { authoringModel } from "@/server/authoring/model";
import { draftRubric } from "@/server/authoring/rubric";
import { fileBytes, loadFile } from "@/server/files";
import { rateLimit } from "@/server/rate-limit";
import { getCourseEditor } from "@/server/studio/course-context";
import { documentText } from "@/server/text-extract";

export type RubricDraftState =
  | { status: "done"; rubric: Rubric; notes: string[]; example: string }
  | { status: "error"; message: string };

const HOUR = 60 * 60_000;

/**
 * Drafts a rubric from the outcome as currently typed (saved or not) and an
 * optional example of good work, pasted or uploaded. Nothing is saved: the
 * draft goes into the editor for the author to change.
 */
export async function draftRubricAction(formData: FormData): Promise<RubricDraftState> {
  const courseId = z.uuid().parse(text(formData, "courseId"));
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/outcome`);
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor?.assignment) return { status: "error", message: "This course has no assignment." };
  const model = authoringModel();
  if (!model) {
    return {
      status: "error",
      message: "Drafting needs the AI gateway (LLM_BASE_URL). Write the rubric below instead.",
    };
  }
  if (!rateLimit(`rubric-draft:${tenant.id}`, 20, HOUR)) {
    return { status: "error", message: "Too many drafts this hour. Try again later." };
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
      model,
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
      return { status: "error", message: "The draft did not come out usable. Try again." };
    }
    return {
      status: "done",
      rubric: result.rubric,
      notes: result.notes,
      example: example.slice(0, 40_000),
    };
  } catch (error) {
    console.error("[authoring] rubric draft failed", error);
    return { status: "error", message: "The AI gateway did not answer. Try again in a moment." };
  }
}
