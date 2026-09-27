"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { text } from "@/app/studio/form-data";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { loadCourseEditor, setCompletionMode } from "@/server/studio/courses";

/**
 * Adds what the course's ending needs and it lacks, e.g. the assignment of a
 * course that came from a manifest (the same mode again only adds).
 */
export async function setUpOutcomeAction(formData: FormData): Promise<void> {
  const courseId = z.uuid().parse(text(formData, "courseId"));
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/outcome`);
  const editor = await loadCourseEditor(getDb(), tenant.id, courseId);
  if (!editor) redirect("/studio/courses");
  await setCompletionMode(getDb(), tenant, courseId, editor.course.completionMode);
  revalidatePath(`/studio/courses/${courseId}`, "layout");
  redirect(`/studio/courses/${courseId}/outcome`);
}
