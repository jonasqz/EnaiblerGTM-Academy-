"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { text } from "@/app/studio/form-data";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { prepareWork } from "@/server/studio/courses";

/**
 * Adds the assignment with a starter rubric: for a course that came from a
 * manifest without one, or to prepare the work before a test-only course
 * switches to it (how the course ends does not change here).
 */
export async function setUpOutcomeAction(formData: FormData): Promise<void> {
  const courseId = z.uuid().parse(text(formData, "courseId"));
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/outcome`);
  await prepareWork(getDb(), tenant.id, courseId);
  revalidatePath(`/studio/courses/${courseId}`, "layout");
  redirect(`/studio/courses/${courseId}/outcome`);
}
