"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { FormState } from "@/app/studio/actions";
import { text, wording } from "@/app/studio/form-data";
import { addVideoFromForm } from "@/app/studio/videos/create";
import { isMediaAccess } from "@/core/media/access";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { deleteVideo, updateVideo } from "@/server/media/library";
import { getStudioText } from "@/server/studio-text";

/*
 * The media library in the Studio (webinar brief §2.4). Every action checks
 * `courses.edit` again and takes the academy from the host, never the form.
 */

/** Adds an upload, a course recording or an embed; the processing runs in the worker. */
export async function addVideoAction(_: FormState, formData: FormData): Promise<FormState> {
  const { tenant, viewer } = await requireCapability("courses.edit", "/studio/videos");
  const t = await getStudioText();
  const added = await addVideoFromForm(tenant, viewer.userId, t, formData);
  if (!added.ok) return { errors: [added.error] };
  revalidatePath("/studio/videos");
  return {
    ok: true,
    message: added.kind === "embed" ? t.t("media.add.addedEmbed") : t.t("media.add.added"),
    warnings: wording(t, [[added.title, "lesson_text"]]).warnings,
  };
}

export async function saveVideoAction(_: FormState, formData: FormData): Promise<FormState> {
  const assetId = z.uuid().parse(text(formData, "assetId"));
  const { tenant } = await requireCapability("courses.edit", `/studio/videos/${assetId}`);
  const t = await getStudioText();
  const title = text(formData, "title").slice(0, 200);
  const access = text(formData, "access");
  const outcome = await updateVideo(getDb(), tenant.id, assetId, {
    title,
    access: isMediaAccess(access) ? access : undefined,
    chapterTitles: formData.has("chapter")
      ? formData.getAll("chapter").map((value) => String(value))
      : undefined,
  });
  if (outcome === "not_found") return { errors: [t.t("media.error.gone")] };
  if (outcome === "chapters_changed") return { errors: [t.t("media.error.chaptersChanged")] };
  revalidatePath("/studio/videos", "layout");
  return {
    ok: true,
    message: t.t("media.saved"),
    warnings: wording(t, [
      [title, "lesson_text"],
      ...formData
        .getAll("chapter")
        .map((value): [string, "lesson_text"] => [String(value), "lesson_text"]),
    ]).warnings,
  };
}

export async function deleteVideoAction(formData: FormData): Promise<void> {
  const assetId = z.uuid().parse(text(formData, "assetId"));
  const { tenant } = await requireCapability("courses.edit", `/studio/videos/${assetId}`);
  await deleteVideo(getDb(), tenant.id, assetId);
  revalidatePath("/studio/videos", "layout");
  // A webinar that showed it as its recording lost it.
  revalidatePath("/studio/webinars", "layout");
  redirect("/studio/videos?deleted=1");
}
