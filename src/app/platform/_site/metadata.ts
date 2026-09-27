import type { Metadata } from "next";

import { SUPPORTED_LOCALES, type Locale } from "@/core/i18n/locales";
import { SITE_PATHS, siteMeta, type SitePage } from "@/core/i18n/site";
import { getLocale, getOrigin } from "@/server/request";

const OG_LOCALES: Record<Locale, string> = { en: "en_US", de: "de_DE" };

/**
 * Search and link-preview data for a page of the website. Each language has
 * its own address (`?lang=`), so search engines can list both.
 */
export async function siteMetadata(page: SitePage): Promise<Metadata> {
  const locale = await getLocale();
  const origin = await getOrigin();
  const { title, description } = siteMeta(page, locale);
  const url = (lang?: Locale) => `${origin}${SITE_PATHS[page]}${lang ? `?lang=${lang}` : ""}`;
  const image = `${origin}/og?page=${page}&lang=${locale}`;
  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: url(locale),
      languages: {
        ...Object.fromEntries(SUPPORTED_LOCALES.map((lang) => [lang, url(lang)])),
        "x-default": url(),
      },
    },
    openGraph: {
      type: "website",
      siteName: "enaibler",
      title,
      description,
      url: url(locale),
      locale: OG_LOCALES[locale],
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
