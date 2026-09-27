"use server";

import type { ThemeInput } from "@/core/theme/schema";
import { requireCapability } from "@/server/access";
import { importBrand } from "@/server/brand/import";
import { env } from "@/server/env";
import { createLlmCaller } from "@/server/llm";
import { rateLimit } from "@/server/rate-limit";

export type BrandImportState =
  | { status: "idle" }
  | { status: "done"; theme: ThemeInput; source: string; notes: string[]; usedAi: boolean }
  | { status: "error"; message: string };

const HOUR = 60 * 60_000;

const MESSAGES = {
  invalid_url: "Enter your website's address, e.g. your-company.com.",
  blocked: "This address cannot be read from our servers. Use your public website.",
  unreachable: "We could not reach this website. Check the address and try again.",
  not_html: "This address does not return a web page.",
} as const;

/** Reads a brand from the academy's website; the result is only a proposal until saved. */
export async function importBrandAction(
  _: BrandImportState,
  formData: FormData,
): Promise<BrandImportState> {
  const { tenant } = await requireCapability("academy.manage", "/studio/settings/brand");
  if (!rateLimit(`brand-import:${tenant.id}`, 10, HOUR)) {
    return { status: "error", message: "Too many imports this hour. Try again later." };
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
  if (!result.ok) return { status: "error", message: MESSAGES[result.error] };
  return {
    status: "done",
    theme: result.theme,
    source: result.source,
    notes: result.notes,
    usedAi: result.usedAi,
  };
}
