"use server";

import type { StudioText } from "@/core/i18n/studio/translator";
import type { ThemeInput } from "@/core/theme/schema";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { fontFromUpload, logoFromUpload } from "@/server/brand/assets";
import { importBrand, type BrandNote } from "@/server/brand/import";
import { env } from "@/server/env";
import { createLlmCaller } from "@/server/llm";
import { rateLimit } from "@/server/rate-limit";
import { getStudioText } from "@/server/studio-text";

export type BrandImportState =
  | { status: "idle" }
  | { status: "done"; theme: ThemeInput; source: string; notes: string[]; usedAi: boolean }
  | { status: "error"; message: string };

const HOUR = 60 * 60_000;

/** The rules report their notes by code; the model already wrote its own in the Studio's language. */
function noteText(t: StudioText, note: BrandNote): string {
  switch (note.code) {
    case "no_brand_color":
      return t.t("brand.import.note.noBrandColor");
    case "dark_site":
      return t.t("brand.import.note.darkSite");
    case "font":
      return t.t("brand.import.note.font", { site: note.site, font: note.font });
    case "model":
      return note.text;
  }
}

/** Reads a brand from the academy's website; the result is only a proposal until saved. */
export async function importBrandAction(
  _: BrandImportState,
  formData: FormData,
): Promise<BrandImportState> {
  const { tenant } = await requireCapability("academy.manage", "/studio/settings/brand");
  const t = await getStudioText();
  if (!rateLimit(`brand-import:${tenant.id}`, 10, HOUR)) {
    return { status: "error", message: t.t("brand.import.rateLimited") };
  }
  const { LLM_BASE_URL, LLM_API_KEY, LLM_BRAND_MODEL, LLM_REVIEW_MODEL } = env();
  const llm = LLM_BASE_URL
    ? createLlmCaller({ baseUrl: LLM_BASE_URL, apiKey: LLM_API_KEY, timeoutMs: 30_000 })
    : null;
  const url = formData.get("url");
  const result = await importBrand(typeof url === "string" ? url : "", {
    llm,
    model: LLM_BRAND_MODEL ?? LLM_REVIEW_MODEL,
    locale: t.locale,
  });
  if (!result.ok) return { status: "error", message: t.t(`brand.import.error.${result.error}`) };
  return {
    status: "done",
    theme: result.theme,
    source: result.source,
    notes: result.notes.map((note) => noteText(t, note)),
    usedAi: result.usedAi,
  };
}

export type LogoUploadState =
  { ok: true; logo: { src: string; png?: string; ratio?: number } } | { ok: false; error: string };

/** Turns an uploaded logo into theme values (PNG copy for mail and share images). */
export async function prepareLogoAction(fileId: string): Promise<LogoUploadState> {
  const { tenant, viewer } = await requireCapability("academy.manage", "/studio/settings/brand");
  const t = await getStudioText();
  const logo = await logoFromUpload(getDb(), tenant.id, fileId, viewer.userId).catch(() => null);
  return logo ? { ok: true, logo } : { ok: false, error: t.t("brand.logo.unreadable") };
}

/** The address of an uploaded font file for the theme. */
export async function prepareFontAction(
  fileId: string,
): Promise<{ ok: true; src: string } | { ok: false; error: string }> {
  const { tenant } = await requireCapability("academy.manage", "/studio/settings/brand");
  const t = await getStudioText();
  const src = await fontFromUpload(getDb(), tenant.id, fileId);
  return src ? { ok: true, src } : { ok: false, error: t.t("brand.fonts.unusable") };
}
