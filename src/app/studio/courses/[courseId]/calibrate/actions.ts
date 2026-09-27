"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { FormState } from "@/app/studio/actions";
import { text } from "@/app/studio/form-data";
import { rubricSchema, type Exemplar } from "@/core/review/rubric";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { fileBytes, loadFile } from "@/server/files";
import { enqueue } from "@/server/jobs/producer";
import { rateLimit } from "@/server/rate-limit";
import { requestCalibration } from "@/server/review/calibration";
import { getCourseEditor } from "@/server/studio/course-context";
import { updateExemplars } from "@/server/studio/courses";
import { getStudioText } from "@/server/studio-text";
import { documentText } from "@/server/text-extract";

const HOUR = 60 * 60_000;
const MAX_EXEMPLARS = 10;

async function context(formData: FormData) {
  const courseId = z.uuid().parse(text(formData, "courseId"));
  const session = await requireCapability("courses.edit", `/studio/courses/${courseId}/calibrate`);
  const editor = await getCourseEditor(session.tenant.id, courseId);
  if (!editor?.rubric) throw new Error("Course has no rubric");
  return { ...session, courseId, rubric: rubricSchema.parse(editor.rubric.definition) };
}

export async function addExemplarAction(_: FormState, formData: FormData): Promise<FormState> {
  const { tenant, courseId, rubric } = await context(formData);
  const t = await getStudioText();
  if (rubric.exemplars.length >= MAX_EXEMPLARS) {
    return { errors: [t.t("authoring.exemplar.tooMany", { max: MAX_EXEMPLARS })] };
  }
  let content = text(formData, "content");
  const fileId = text(formData, "fileId");
  if (fileId) {
    const record = await loadFile(getDb(), tenant.id, fileId);
    if (record?.purpose === "exemplar") {
      content = (await documentText(await fileBytes(record), record.contentType)) || content;
    }
  }
  if (content.length < 20) return { errors: [t.t("authoring.exemplar.contentMissing")] };
  const expected = text(formData, "expected");
  if (expected !== "pass" && expected !== "fail") {
    return { errors: [t.t("authoring.exemplar.expectedMissing")] };
  }
  const scores: Record<string, number> = {};
  for (const criterion of rubric.criteria) {
    const value = text(formData, `score.${criterion.id}`);
    if (value !== "") scores[criterion.id] = Number(value);
  }
  const exemplar: Exemplar = {
    id: `ex-${randomUUID().slice(0, 8)}`,
    ...(text(formData, "title") ? { title: text(formData, "title").slice(0, 120) } : {}),
    expected_pass: expected === "pass",
    content: content.slice(0, 40_000),
    ...(Object.keys(scores).length > 0 ? { expected_scores: scores } : {}),
    ...(text(formData, "notes") ? { notes: text(formData, "notes").slice(0, 2_000) } : {}),
  };
  await updateExemplars(getDb(), tenant.id, courseId, [...rubric.exemplars, exemplar]);
  revalidatePath(`/studio/courses/${courseId}`, "layout");
  return { ok: true, message: t.t("authoring.exemplar.added") };
}

export async function deleteExemplarAction(formData: FormData): Promise<void> {
  const { tenant, courseId, rubric } = await context(formData);
  const id = text(formData, "exemplarId");
  await updateExemplars(
    getDb(),
    tenant.id,
    courseId,
    rubric.exemplars.filter((exemplar) => exemplar.id !== id),
  );
  revalidatePath(`/studio/courses/${courseId}`, "layout");
}

export async function runCalibrationAction(formData: FormData): Promise<void> {
  const { tenant, viewer, courseId } = await context(formData);
  if (!rateLimit(`calibration:${tenant.id}`, 10, HOUR)) {
    redirect(`/studio/courses/${courseId}/calibrate?error=limit`);
  }
  const runId = await requestCalibration(
    getDb(),
    tenant.id,
    { courseId, requestedBy: viewer.userId },
    enqueue,
  );
  revalidatePath(`/studio/courses/${courseId}/calibrate`);
  redirect(`/studio/courses/${courseId}/calibrate${runId ? "" : "?error=examples"}`);
}
