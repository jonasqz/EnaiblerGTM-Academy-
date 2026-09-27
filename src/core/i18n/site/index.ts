import type { Locale } from "@/core/i18n/locales";
import { CONSULTANCIES, SOFTWARE } from "@/core/i18n/site/audiences";
import { SITE_COMMON } from "@/core/i18n/site/common";
import { CREATE } from "@/core/i18n/site/create";
import { HOME } from "@/core/i18n/site/home";
import { HOW } from "@/core/i18n/site/how";
import { LEGAL } from "@/core/i18n/site/legal";

/*
 * enaibler's website on the platform host: its pages and where they live.
 * The legal pages come from Markdown instead (core/platform/legal.ts).
 */

export const SITE_PAGES = ["home", "how", "consultancies", "software", "create"] as const;
export type SitePage = (typeof SITE_PAGES)[number];

/** Addresses on the platform host (served from src/app/platform through the proxy). */
export const SITE_PATHS: Record<SitePage, string> = {
  home: "/",
  how: "/how-it-works",
  consultancies: "/for/consultancies",
  software: "/for/software",
  create: "/create",
};

export function isSitePage(value: unknown): value is SitePage {
  return typeof value === "string" && (SITE_PAGES as readonly string[]).includes(value);
}

/** Title and description for search results and link previews. */
export function siteMeta(page: SitePage, locale: Locale): { title: string; description: string } {
  switch (page) {
    case "home":
      return HOME[locale].meta;
    case "how":
      return HOW[locale].meta;
    case "consultancies":
      return CONSULTANCIES[locale].meta;
    case "software":
      return SOFTWARE[locale].meta;
    case "create":
      return CREATE[locale].meta;
  }
}

/** What a page's preview image says: its eyebrow and its headline. */
export function sitePreview(page: SitePage, locale: Locale): { eyebrow: string; title: string } {
  switch (page) {
    case "home": {
      const { eyebrow, title, highlight } = HOME[locale].hero;
      return { eyebrow, title: `${title} ${highlight}` };
    }
    case "how":
      return HOW[locale].hero;
    case "consultancies":
      return CONSULTANCIES[locale].hero;
    case "software":
      return SOFTWARE[locale].hero;
    case "create":
      return CREATE[locale];
  }
}

/** Every text of the site, for the tests (same shape in each language, wording rules). */
export const SITE_COPY = {
  common: SITE_COMMON,
  home: HOME,
  how: HOW,
  consultancies: CONSULTANCIES,
  software: SOFTWARE,
  create: CREATE,
  legal: LEGAL,
} as const;
