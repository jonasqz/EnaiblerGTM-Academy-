import type { Metadata } from "next";

import { SUPPORTED_LOCALES, type Locale } from "@/core/i18n/locales";
import { SITE_PATHS, siteMeta, type SitePage } from "@/core/i18n/site";
import { LEGAL } from "@/core/i18n/site/legal";
import { LEGAL_PATHS, type LegalPage } from "@/core/platform/legal";
import { finalLocales, loadLegalDocument } from "@/server/platform/legal";
import { getLocale, getOrigin } from "@/server/request";

const OG_LOCALES: Record<Locale, string> = { en: "en_US", de: "de_DE" };

/**
 * Search and link-preview data for a page of the website. Each language has
 * its own address (`?lang=`), so search engines can list both.
 */
export async function siteMetadata(page: SitePage): Promise<Metadata> {
  const locale = await getLocale();
  return pageMetadata({
    path: SITE_PATHS[page],
    locale,
    ...siteMeta(page, locale),
    languages: SUPPORTED_LOCALES,
    image: `/og?page=${page}&lang=${locale}`,
  });
}

/**
 * The same for a legal page, which search engines only see once it is in
 * force: a draft is never indexed, and only final versions are listed as
 * its languages.
 */
export async function legalMetadata(page: LegalPage): Promise<Metadata> {
  const locale = await getLocale();
  const document = await loadLegalDocument(page, locale);
  if (!document) return {};
  const final = document.status === "final";
  const metadata = await pageMetadata({
    path: LEGAL_PATHS[page],
    locale,
    title: `${document.title} · enaibler`,
    description:
      document.description ?? LEGAL[locale].description.replace("{title}", document.title),
    languages: final ? await finalLocales(page) : [locale],
  });
  return final ? metadata : { ...metadata, robots: { index: false, follow: true } };
}

async function pageMetadata(input: {
  path: string;
  locale: Locale;
  title: string;
  description: string;
  /** Languages to list as alternates; the unlabelled address only when every language is. */
  languages: readonly Locale[];
  /** Path of the link preview image, if the page has one. */
  image?: string;
}): Promise<Metadata> {
  const { locale, title, description } = input;
  const origin = await getOrigin();
  const url = (lang?: Locale) => `${origin}${input.path}${lang ? `?lang=${lang}` : ""}`;
  const image = input.image && `${origin}${input.image}`;
  const everyLanguage = SUPPORTED_LOCALES.every((lang) => input.languages.includes(lang));
  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: url(locale),
      languages: {
        ...Object.fromEntries(input.languages.map((lang) => [lang, url(lang)])),
        ...(everyLanguage ? { "x-default": url() } : {}),
      },
    },
    openGraph: {
      type: "website",
      siteName: "enaibler",
      title,
      description,
      url: url(locale),
      locale: OG_LOCALES[locale],
      ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: title }] } : {}),
    },
    twitter: image
      ? { card: "summary_large_image", title, description, images: [image] }
      : { card: "summary", title, description },
  };
}
