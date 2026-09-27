"use server";

import type { StudioText } from "@/core/i18n/studio/translator";
import type { ThemeInput } from "@/core/theme/schema";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { fontFromUpload, logoFromUpload } from "@/server/brand/assets";
import { importBrand } from "@/server/brand/import";
import { env } from "@/server/env";
import { createLlmCaller } from "@/server/llm";
import { rateLimit } from "@/server/rate-limit";
import { getStudioText } from "@/server/studio-text";

export type BrandImportState =
  | { status: "idle" }
  | { status: "done"; theme: ThemeInput; source: string; notes: string[]; usedAi: boolean }
  | { status: "error"; message: string };

const HOUR = 60 * 60_000;

/**
 * The rule-based proposal notes its findings in English (core/brand/propose.ts);
 * the author reads them in the Studio's language. The model's own notes stay as written.
 */
function noteText(t: StudioText, note: string): string {
  if (note === "No distinct brand colour found: primary starts as enaibler blue.")
    return t.t("brand.import.note.noBrandColor");
  if (note === "Your site is dark; the academy starts light for long reading. Adjust if you like.")
    return t.t("brand.import.note.darkSite");
  const font = /^Your site uses “(.+)”; closest open-source match: (.+)\.$/.exec(note);
  if (font) return t.t("brand.import.note.font", { site: font[1], font: font[2] });
  return note;
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
