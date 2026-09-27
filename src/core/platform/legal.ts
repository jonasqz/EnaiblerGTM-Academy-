import { parse as parseYaml } from "yaml";
import { z } from "zod";

/*
 * enaibler's own legal pages on its website: imprint, privacy policy, terms
 * and the data processing agreement. They are Markdown files in
 * content/legal/<page>.<locale>.md with a small front matter, so counsel
 * reviews plain text and a change goes through CI. A page is in force only
 * once it is marked final: drafts carry a banner, stay out of search engines
 * and never open signup.
 */

export const LEGAL_PAGES = ["imprint", "privacy", "terms", "dpa"] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];

/** Addresses on the platform host (served from src/app/platform through the proxy). */
export const LEGAL_PATHS: Record<LegalPage, string> = {
  imprint: "/imprint",
  privacy: "/privacy",
  terms: "/terms",
  dpa: "/dpa",
};

export type LegalStatus = "draft" | "final";

export interface LegalDocument {
  title: string;
  status: LegalStatus;
  /** Last updated (YYYY-MM-DD); also the version recorded when an admin accepts it. */
  updated: string;
  /** For search results; the page falls back to a generic line. */
  description?: string;
  /** The Markdown after the front matter. */
  body: string;
}

const frontMatterSchema = z.strictObject({
  title: z.string().trim().min(1).max(60),
  status: z.enum(["draft", "final"]),
  updated: z.iso.date(),
  description: z.string().trim().min(1).max(170).optional(),
});

const FRONT_MATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function parseLegalDocument(
  source: string,
): { ok: true; document: LegalDocument } | { ok: false; error: string } {
  const match = FRONT_MATTER.exec(source);
  if (!match) return { ok: false, error: "The document must start with a front matter (---)." };
  let data: unknown;
  try {
    data = parseYaml(match[1]!);
  } catch (error) {
    return { ok: false, error: `Front matter: ${(error as Error).message}` };
  }
  const parsed = frontMatterSchema.safeParse(data ?? {});
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const body = source.slice(match[0].length).trim();
  if (!body) return { ok: false, error: "The document has no text after its front matter." };
  return { ok: true, document: { ...parsed.data, body } };
}

/**
 * What the operator still has to fill in: text in [square brackets] that is
 * not a link. A final document must not have any.
 */
export function legalPlaceholders(body: string): string[] {
  // Link reference definitions ("[dpa]: /dpa") are links too.
  const text = body.replace(/^ {0,3}\[[^\]\n]+\]:.*$/gm, "");
  return [...text.matchAll(/(?<!\])\[(?=[^\]\n]*\p{L})[^\]\n]+\](?![([])/gu)].map(
    (match) => match[0],
  );
}

/** Where the website links for a legal page: the operator's own address when set, else the built-in page. */
export function legalHref(page: LegalPage, links: Partial<Record<LegalPage, string>>): string {
  return links[page] || LEGAL_PATHS[page];
}

/**
 * Signup records that the customer accepted the terms and the DPA, so in
 * production both have to be in force: each at the operator's own address
 * (PLATFORM_TERMS_URL, PLATFORM_DPA_URL) or as a built-in page that is final
 * in every language. A draft never opens signup. Development stays open.
 */
export function agreementsInForce(input: {
  production: boolean;
  links: { terms?: string; dpa?: string };
  final: Record<"terms" | "dpa", boolean>;
}): boolean {
  if (!input.production) return true;
  return (["terms", "dpa"] as const).every(
    (page) => Boolean(input.links[page]) || input.final[page],
  );
}
