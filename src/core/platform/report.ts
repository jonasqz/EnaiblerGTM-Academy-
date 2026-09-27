import { z } from "zod";

import { pageViewPath } from "@/core/analytics/page-views";
import { formatPublicId, generatePublicId } from "@/core/credentials/public-id";

/*
 * Notice and action (Digital Services Act, Art. 16): anyone can report
 * content that an academy publishes on enaibler, or anything on enaibler's
 * website, with where it is, why, who reports it and a statement of good
 * faith. The report goes to the operator by e-mail and the reporter gets a
 * confirmation of receipt. Nothing is stored in the database.
 */

export const REPORT_PATH = "/report";

/**
 * Child sexual abuse material has its own reason: only such reports may come
 * without the reporter's name and e-mail address (DSA Art. 16(2)(c)).
 */
export const REPORT_REASONS = ["illegal", "csam", "terms", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_FIELDS = [
  "url",
  "reason",
  "explanation",
  "name",
  "email",
  "goodFaith",
] as const;
export type ReportField = (typeof REPORT_FIELDS)[number];

export const REPORT_LIMITS = {
  url: 2048,
  explanation: { min: 20, max: 5000 },
  name: 120,
} as const;

export interface ContentReport {
  url: string;
  reason: ReportReason;
  explanation: string;
  name: string | null;
  email: string | null;
}

export interface ContentReportInput {
  url?: string;
  reason?: string;
  explanation?: string;
  name?: string;
  email?: string;
  goodFaith?: boolean;
}

const contentUrl = z
  .string()
  .trim()
  .max(REPORT_LIMITS.url)
  .pipe(z.url({ protocol: /^https?$/ }));

const reportSchema = z.strictObject({
  url: contentUrl,
  reason: z.enum(REPORT_REASONS),
  explanation: z
    .string()
    .trim()
    .min(REPORT_LIMITS.explanation.min)
    .max(REPORT_LIMITS.explanation.max),
  name: z.string().trim().max(REPORT_LIMITS.name),
  email: z.union([z.literal(""), z.email().max(254)]),
  goodFaith: z.literal(true),
});

/** Every field that needs another look, in form order, or the report as it will be sent. */
export function validateContentReport(
  input: ContentReportInput,
): { ok: true; report: ContentReport } | { ok: false; fields: ReportField[] } {
  const values = {
    url: input.url ?? "",
    reason: input.reason ?? "",
    explanation: input.explanation ?? "",
    name: input.name ?? "",
    email: (input.email ?? "").trim().toLowerCase(),
    goodFaith: input.goodFaith === true,
  };
  const parsed = reportSchema.safeParse(values);
  const invalid = new Set<ReportField>(
    parsed.success ? [] : parsed.error.issues.map((issue) => issue.path[0] as ReportField),
  );
  // Name and e-mail are how the reporter hears back; only reports of child
  // sexual abuse material may leave them out.
  if (values.reason !== "csam") {
    if (values.name.trim().length < 2) invalid.add("name");
    if (!values.email) invalid.add("email");
  }
  if (!parsed.success || invalid.size > 0) {
    return { ok: false, fields: REPORT_FIELDS.filter((field) => invalid.has(field)) };
  }
  const { url, reason, explanation, name, email } = parsed.data;
  return {
    ok: true,
    report: { url, reason, explanation, name: name || null, email: email || null },
  };
}

/** A `?url=` worth putting into the form: a plausible web address, else nothing. */
export function prefilledContentUrl(value: unknown): string {
  return typeof value === "string" && contentUrl.safeParse(value).success ? value.trim() : "";
}

/**
 * "Report content" in an academy's footer: the website's form with the page's
 * address filled in. The address loses its query string, and pages whose
 * address carries a token (sign-in links, invitations) are reported by the
 * academy's address alone. Null without a platform host: no form to go to.
 */
export function reportContentHref(
  platformOrigin: string | null,
  page: { origin: string; pathname: string },
): string | null {
  if (!platformOrigin) return null;
  const url = new URL(REPORT_PATH, platformOrigin);
  url.searchParams.set("url", `${page.origin}${pageViewPath(page.pathname) ?? "/"}`);
  return url.toString();
}

/** What reporter and operator quote when they write about a report, e.g. R-7K2Q-XM4B. */
export function reportReference(
  random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b),
): string {
  return `R-${formatPublicId(generatePublicId(random).slice(0, 8))}`;
}
