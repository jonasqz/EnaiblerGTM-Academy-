"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { requireViewer } from "@/server/access";
import { enqueue } from "@/server/jobs/producer";
import { completeLesson, submitAssignment } from "@/server/learning";

export async function completeLessonAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "");
  const key = String(formData.get("key") ?? "");
  const { tenant, viewer } = await requireViewer(`/courses/${slug}`);
  const result = await completeLesson(getDb(), tenant, viewer.userId, { courseSlug: slug, key });
  if (!result) redirect(`/courses/${slug}`);
  revalidatePath(`/courses/${slug}`);
  redirect(
    result.nextKey ? `/courses/${slug}/learn/${result.nextKey}` : `/courses/${slug}/assignment`,
  );
}

export type SubmitState =
  | { status: "idle" }
  | {
      status: "error";
      error: "empty" | "not_allowed" | "invalid" | "not_enrolled";
      fieldErrors?: Record<string, string>;
    };

export async function submitAssignmentAction(
  _previous: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const slug = String(formData.get("slug") ?? "");
  const { tenant, viewer } = await requireViewer(`/courses/${slug}/assignment`);
  const form: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("field.") && typeof value === "string") form[key.slice(6)] = value;
  }
  const result = await submitAssignment(
    getDb(),
    tenant,
    viewer.userId,
    slug,
    {
      text: typeof formData.get("text") === "string" ? String(formData.get("text")) : undefined,
      url: typeof formData.get("url") === "string" ? String(formData.get("url")) : undefined,
      form: Object.keys(form).length > 0 ? form : undefined,
      fileIds: formData
        .getAll("files")
        .filter((value): value is string => typeof value === "string"),
    },
    enqueue,
  );
  if (!result.ok) return { status: "error", error: result.error, fieldErrors: result.fieldErrors };
  revalidatePath(`/courses/${slug}/assignment`);
  redirect(`/courses/${slug}/assignment#attempts`);
}
