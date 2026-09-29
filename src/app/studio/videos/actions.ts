"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { FormState } from "@/app/studio/actions";
import { text, wording } from "@/app/studio/form-data";
import { isLocale, type Locale } from "@/core/i18n/locales";
import type { StudioKey } from "@/core/i18n/studio/index";
import { isMediaAccess } from "@/core/media/access";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { enqueue } from "@/server/jobs/producer";
import {
  createEmbeddedVideo,
  createUploadedVideo,
  createVideoFromRecording,
  deleteVideo,
  updateVideo,
  type CreateVideoResult,
} from "@/server/media/library";
import { getStudioText } from "@/server/studio-text";

/*
 * The media library in the Studio (webinar brief §2.4). Every action checks
 * `courses.edit` again and takes the academy from the host, never the form.
 */

const ISSUES: Record<Exclude<CreateVideoResult, { ok: true }>["issue"], StudioKey> = {
  not_found: "media.error.notFound",
  not_video: "media.error.notVideo",
  in_use: "media.error.inUse",
  not_ready: "media.error.notReady",
  storage_quota: "media.error.storageQuota",
  invalid_url: "media.error.invalidUrl",
};

function localeOf(formData: FormData, offered: readonly Locale[]): Locale | null {
  const value = text(formData, "locale");
  return isLocale(value) && offered.includes(value) ? value : (offered[0] ?? null);
}

/** Adds an upload, a course recording or an embed; the processing runs in the worker. */
export async function addVideoAction(_: FormState, formData: FormData): Promise<FormState> {
  const { tenant, viewer } = await requireCapability("courses.edit", "/studio/videos");
  const t = await getStudioText();
  const kind = text(formData, "kind");
  const title = text(formData, "title").slice(0, 200);
  const locale = localeOf(formData, tenant.settings.locales);
  let result: CreateVideoResult;
  if (kind === "upload") {
    const fileId = text(formData, "fileId");
    if (!z.uuid().safeParse(fileId).success) return { errors: [t.t("media.error.chooseFile")] };
    result = await createUploadedVideo(
      getDb(),
      tenant.id,
      { fileId, title, locale, createdBy: viewer.userId },
      enqueue,
    );
  } else if (kind === "recording") {
    result = await createVideoFromRecording(
      getDb(),
      tenant.id,
      { sourceId: text(formData, "sourceId"), title, createdBy: viewer.userId },
      enqueue,
    );
  } else if (kind === "embed") {
    result = await createEmbeddedVideo(getDb(), tenant.id, {
      url: text(formData, "url"),
      title,
      locale,
      createdBy: viewer.userId,
    });
  } else {
    return { errors: [t.t("media.error.chooseFile")] };
  }
  if (!result.ok) return { errors: [t.t(ISSUES[result.issue])] };
  revalidatePath("/studio/videos");
  return {
    ok: true,
    message: kind === "embed" ? t.t("media.add.addedEmbed") : t.t("media.add.added"),
    warnings: wording(t, [[title, "lesson_text"]]).warnings,
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
  redirect("/studio/videos?deleted=1");
}
