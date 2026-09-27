import { SUPPORTED_LOCALES, type Locale } from "@/core/i18n/locales";
import { SITE_PAGES, SITE_PATHS } from "@/core/i18n/site";
import { LEGAL_PAGES, LEGAL_PATHS } from "@/core/platform/legal";
import { platformConfig } from "@/server/platform/config";
import { finalLocales } from "@/server/platform/legal";
import { getOrigin } from "@/server/request";

/**
 * The website's pages in every language, for search engines (/sitemap.xml on
 * the platform host). Legal pages only in the languages where they are final,
 * and not at all when the operator keeps them elsewhere.
 */
export async function GET(): Promise<Response> {
  const origin = await getOrigin();
  const links = platformConfig()?.links ?? {};
  const legal = await Promise.all(
    LEGAL_PAGES.filter((page) => !links[page]).map(async (page) => ({
      path: LEGAL_PATHS[page],
      locales: await finalLocales(page),
    })),
  );
  const pages: Array<{ path: string; locales: readonly Locale[] }> = [
    ...SITE_PAGES.map((page) => ({ path: SITE_PATHS[page], locales: SUPPORTED_LOCALES })),
    ...legal,
  ];
  const url = (path: string, locale: string) => `${origin}${path}?lang=${locale}`;
  const entries = pages.flatMap(({ path, locales }) =>
    locales.map((locale) => {
      const alternates = locales
        .map(
          (other) =>
            `    <xhtml:link rel="alternate" hreflang="${other}" href="${url(path, other)}"/>`,
        )
        .join("\n");
      return `  <url>\n    <loc>${url(path, locale)}</loc>\n${alternates}\n  </url>`;
    }),
  );
  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`,
    ...entries,
    `</urlset>`,
  ].join("\n");
  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
