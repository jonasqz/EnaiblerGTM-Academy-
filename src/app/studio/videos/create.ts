import "server-only";

import { z } from "zod";

import { text } from "@/app/studio/form-data";
import { isLocale, type Locale } from "@/core/i18n/locales";
import type { StudioKey } from "@/core/i18n/studio/index";
import type { StudioText } from "@/core/i18n/studio/translator";
import type { TenantContext } from "@/core/tenant/context";
import { getDb } from "@/db/client";
import { enqueue } from "@/server/jobs/producer";
import {
  createEmbeddedVideo,
  createUploadedVideo,
  createVideoFromRecording,
  type CreateVideoResult,
} from "@/server/media/library";

/*
 * The three ways into the media library, from the "add a video" form: an
 * upload, a course recording or a YouTube/Vimeo link. Studio → Videos and a
 * webinar's Recording tab share it; each action checks its capability first.
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

export type AddedVideo =
  | { ok: true; id: string; kind: "upload" | "recording" | "embed"; title: string }
  | { ok: false; error: string };

export async function addVideoFromForm(
  tenant: TenantContext,
  userId: string,
  t: StudioText,
  formData: FormData,
): Promise<AddedVideo> {
  const kind = text(formData, "kind");
  const title = text(formData, "title").slice(0, 200);
  const locale = localeOf(formData, tenant.settings.locales);
  let result: CreateVideoResult;
  if (kind === "upload") {
    const fileId = text(formData, "fileId");
    if (!z.uuid().safeParse(fileId).success) {
      return { ok: false, error: t.t("media.error.chooseFile") };
    }
    result = await createUploadedVideo(
      getDb(),
      tenant.id,
      { fileId, title, locale, createdBy: userId },
      enqueue,
    );
  } else if (kind === "recording") {
    result = await createVideoFromRecording(
      getDb(),
      tenant.id,
      { sourceId: text(formData, "sourceId"), title, createdBy: userId },
      enqueue,
    );
  } else if (kind === "embed") {
    result = await createEmbeddedVideo(getDb(), tenant.id, {
      url: text(formData, "url"),
      title,
      locale,
      createdBy: userId,
    });
  } else {
    return { ok: false, error: t.t("media.error.chooseFile") };
  }
  if (!result.ok) return { ok: false, error: t.t(ISSUES[result.issue]) };
  return { ok: true, id: result.id, kind, title };
}
