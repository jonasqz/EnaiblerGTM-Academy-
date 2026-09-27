import { SUPPORTED_LOCALES } from "@/core/i18n/locales";
import { SITE_PAGES, SITE_PATHS } from "@/core/i18n/site";
import { getOrigin } from "@/server/request";

/** The website's pages in every language, for search engines (/sitemap.xml on the platform host). */
export async function GET(): Promise<Response> {
  const origin = await getOrigin();
  const url = (path: string, locale: string) => `${origin}${path}?lang=${locale}`;
  const entries = SITE_PAGES.flatMap((page) =>
    SUPPORTED_LOCALES.map((locale) => {
      const alternates = SUPPORTED_LOCALES.map(
        (other) =>
          `    <xhtml:link rel="alternate" hreflang="${other}" href="${url(SITE_PATHS[page], other)}"/>`,
      ).join("\n");
      return `  <url>\n    <loc>${url(SITE_PATHS[page], locale)}</loc>\n${alternates}\n  </url>`;
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
