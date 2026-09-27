import {
  lintLocalizedWording,
  lintWording,
  type WordingFinding,
} from "@/core/compliance/wording-lint";
import { isLocale, localizedEntries, type Locale, type LocalizedText } from "@/core/i18n/locales";

/*
 * How an academy sets up sharing in the Studio (brief §2 steps 7–8, §6): its
 * LinkedIn page, the post suggested to learners, hashtags, and the call to
 * action on certificate pages. The manifest schema stays the rule; this finds
 * what an admin typed wrong and names it by code, so the Studio can word it.
 */

/** What a suggested post can contain; see core/credentials/share. */
export const POST_PLACEHOLDERS = ["course", "academy", "proof", "artifact", "url"] as const;
/** What a call-to-action address can contain; see CTA_URL_PLACEHOLDERS in the manifest. */
export const CTA_PLACEHOLDERS = ["course", "path"] as const;
/** The manifest's limits for the suggested post and its hashtags. */
export const POST_MAX_LENGTH = 1200;
export const MAX_HASHTAGS = 5;

/** The label academies start with (see server/platform/academies). */
export const DEFAULT_CTA_LABEL: LocalizedText = { en: "Start this course", de: "Kurs starten" };

// Same test as the manifest: anything in braces that is not one of the placeholders.
const UNKNOWN_PLACEHOLDER = /\{(?!(?:course|academy|proof|artifact|url)\})[^}]*\}/g;

/** "{name}", "{Course}"…: what the post has in braces that would stay as typed. */
export function unknownPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(UNKNOWN_PLACEHOLDER)].map((match) => match[0]))];
}

/** Languages whose post has no {url}: its readers would find no way to the certificate. */
export function postsWithoutUrl(postText: LocalizedText): Locale[] {
  return localizedEntries(postText)
    .filter(([, text]) => !text.includes("{url}"))
    .map(([locale]) => locale);
}

const PAGE_ADDRESS = /linkedin\.com\/(?:company|school|showcase)\/(\d+)(?:[/?#]|$)/i;

/**
 * The academy's LinkedIn page id from what an admin pastes: the number, or
 * the page's admin address, which carries it. Anything else is returned as
 * typed for the manifest to refuse; empty means no page.
 */
export function linkedInPageId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  return PAGE_ADDRESS.exec(value)?.[1] ?? value;
}

/**
 * The call to action's own address as typed: a page of the academy ("/…")
 * stays, "your-company.com/…" gets https://; empty means the course's own
 * entry link.
 */
export function ctaAddress(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (value.startsWith("/")) return value;
  if (/^http:\/\//i.test(value)) return value.replace(/^http:/i, "https:");
  return /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
}

/** Hashtags as typed ("#Freelancing, invoices"): one per word, repeats left out. */
export function parseHashtags(input: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const tag of input.split(/[\s,;]+/)) {
    const key = tag.replace(/^#/, "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

export interface SharingInput {
  linkedinOrganizationId: string | null;
  /** The suggested post per language; a language left out gets enaibler's text. */
  postText: LocalizedText;
  hashtags: readonly string[];
  ctaLabel: LocalizedText;
  /** Where the call to action leads; null for the course's own entry link. */
  ctaUrl: string | null;
}

/** A problem with the sharing settings, by code; the Studio words it (sharingIssueText). */
export type SharingIssue =
  | { code: "wording"; finding: WordingFinding }
  | { code: "placeholder"; locale: Locale; placeholders: string[] }
  | { code: "post_too_long"; locale: Locale; max: number }
  | { code: "hashtag"; tag: string }
  | { code: "hashtag_count"; max: number }
  | { code: "linkedin_id" }
  | { code: "cta_url" }
  | { code: "cta_label" }
  /** Anything else the manifest refused, in its own (English) words. */
  | { code: "other"; message: string };

/**
 * Checked before the manifest: it would report a blocked word and an unknown
 * placeholder in a post the same way, in English.
 */
export function sharingWording(input: SharingInput): WordingFinding[] {
  return [
    ...lintLocalizedWording(input.postText, "credential_template"),
    ...lintWording(input.hashtags.join(" "), "credential_template"),
    ...lintLocalizedWording(input.ctaLabel, "cta_label"),
  ];
}

interface ManifestIssue {
  path: readonly PropertyKey[];
  message: string;
}

/** What the manifest schema refused in the sharing settings, by code. */
export function sharingIssues(
  issues: readonly ManifestIssue[],
  input: SharingInput,
): SharingIssue[] {
  return issues.flatMap((issue): SharingIssue[] => {
    const [root, section, field, item] = issue.path;
    const other = { code: "other" as const, message: `${issue.path.join(".")}: ${issue.message}` };
    if (root !== "tenant") return [other];
    if (section === "linkedin_organization_id") return [{ code: "linkedin_id" }];
    if (section === "verification_cta") {
      return field === "url" ? [{ code: "cta_url" }] : [{ code: "cta_label" }];
    }
    if (section !== "sharing") return [other];
    if (field === "hashtags") {
      return typeof item === "number"
        ? [{ code: "hashtag", tag: input.hashtags[item] ?? "" }]
        : [{ code: "hashtag_count", max: MAX_HASHTAGS }];
    }
    if (field === "post_text" && isLocale(item)) {
      return [{ code: "post_too_long", locale: item, max: POST_MAX_LENGTH }];
    }
    if (field === "post_text") {
      const found = localizedEntries(input.postText).flatMap(([locale, text]) => {
        const placeholders = unknownPlaceholders(text);
        return placeholders.length ? [{ code: "placeholder" as const, locale, placeholders }] : [];
      });
      return found.length ? found : [other];
    }
    return [other];
  });
}
