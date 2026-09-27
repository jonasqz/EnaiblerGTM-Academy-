import { z } from "zod";

import { isLocale, localeSchema, type Locale } from "@/core/i18n/locales";
import { SLUG_PATTERN } from "@/core/shared/slug";

/**
 * Entry context (brief §5): `/start?path=<id>&course=<slug>&lang=<de|en>&utm_*`.
 * Everything is optional and invalid values are dropped silently: entry must
 * never fail. The context survives sign-up (it rides along in the magic-link
 * callback URL) and is stored on the enrollment.
 */
export const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;
export type UtmKey = (typeof UTM_KEYS)[number];

const utmValue = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[\p{L}\p{N} ._~:/+-]+$/u);

export const entryContextSchema = z.strictObject({
  path: z.string().regex(SLUG_PATTERN).max(64).optional(),
  course: z.string().regex(SLUG_PATTERN).max(64).optional(),
  lang: localeSchema.optional(),
  utm: z.partialRecord(z.enum(UTM_KEYS), utmValue).optional(),
});

export type EntryContext = z.infer<typeof entryContextSchema>;

function pick(schema: z.ZodType<string>, value: string | null): string | undefined {
  if (value === null) return undefined;
  const result = schema.safeParse(value.trim());
  return result.success ? result.data : undefined;
}

const slugValue = z.string().regex(SLUG_PATTERN).max(64);

export function parseEntryParams(
  params: URLSearchParams,
  options: { tenantLocales: readonly Locale[] },
): EntryContext {
  const context: EntryContext = {};

  const path = pick(slugValue, params.get("path"));
  if (path) context.path = path;

  const course = pick(slugValue, params.get("course"));
  if (course) context.course = course;

  const lang = params.get("lang")?.trim().toLowerCase();
  if (isLocale(lang) && options.tenantLocales.includes(lang)) context.lang = lang;

  const utm: Partial<Record<UtmKey, string>> = {};
  for (const key of UTM_KEYS) {
    const value = pick(utmValue, params.get(`utm_${key}`));
    if (value) utm[key] = value;
  }
  if (Object.keys(utm).length > 0) context.utm = utm;

  return context;
}

export function isEmptyEntryContext(context: EntryContext): boolean {
  return !context.path && !context.course && !context.lang && !context.utm;
}

/** Compact, URL-safe encoding for cookies and callback URLs. */
export function encodeEntryContext(context: EntryContext): string {
  return Buffer.from(JSON.stringify(context), "utf8").toString("base64url");
}

export function decodeEntryContext(encoded: string | null | undefined): EntryContext | null {
  if (!encoded || encoded.length > 2048) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    const result = entryContextSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Where to send the learner after entry: the course if one was named, else
 * the path, else the academy home. Returns a same-origin path only.
 */
export function entryDestination(context: EntryContext): string {
  if (context.course) return `/courses/${context.course}`;
  if (context.path) return `/paths/${context.path}`;
  return "/";
}

/** Flattens the context into event properties (brief §10: every event carries utm_*). */
export function entryEventProperties(
  context: EntryContext | null | undefined,
): Record<string, string> {
  if (!context) return {};
  const props: Record<string, string> = {};
  if (context.path) props.entry_path = context.path;
  if (context.course) props.entry_course = context.course;
  if (context.lang) props.entry_lang = context.lang;
  for (const key of UTM_KEYS) {
    const value = context.utm?.[key];
    if (value) props[`utm_${key}`] = value;
  }
  return props;
}

const NEXT_SECTIONS = ["/studio", "/me", "/courses", "/paths"];

/**
 * Where to go after sign-in when it was not an entry link (e.g. /studio).
 * Only same-origin paths under known sections; anything else is dropped.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || value.length > 300) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  if (/[\s<>"']/.test(value)) return null;
  const path = value.split(/[?#]/)[0] ?? "";
  if (path.split("/").some((segment) => segment === "..")) return null;
  return NEXT_SECTIONS.some((section) => path === section || path.startsWith(`${section}/`))
    ? value
    : null;
}
