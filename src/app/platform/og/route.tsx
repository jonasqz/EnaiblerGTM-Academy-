import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { isLocale, type Locale } from "@/core/i18n/locales";
import { isSitePage, sitePreview, type SitePage } from "@/core/i18n/site";
import { SITE_COMMON } from "@/core/i18n/site/common";
import { DEFAULT_THEME } from "@/core/theme/enaibler-tokens";
import { imageFonts } from "@/server/og-fonts";

/**
 * The link preview of a website page (1200×630), in enaibler's theme:
 * `/og?page=how&lang=de` on the platform host. Unknown values fall back to
 * the home page in English, so a shared link always has a picture.
 */
export async function GET(request: NextRequest): Promise<ImageResponse> {
  const params = request.nextUrl.searchParams;
  const requested = params.get("page");
  const lang = params.get("lang");
  const page: SitePage = isSitePage(requested) ? requested : "home";
  const locale: Locale = isLocale(lang) ? lang : "en";
  const { eyebrow, title } = sitePreview(page, locale);
  const { colors } = DEFAULT_THEME;
  const accents = colors.accents.length ? colors.accents : [colors.primary];

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: colors.surface,
        color: colors.ink,
        fontFamily: "Body",
      }}
    >
      <div style={{ display: "flex", height: 14 }}>
        {accents.map((color) => (
          <div key={color} style={{ flex: 1, background: color }} />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flex: 1,
          padding: "64px 72px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: colors.primary,
            }}
          >
            {eyebrow}
          </div>
          <div style={{ fontSize: 66, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1.5 }}>
            {title}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>enaibler</div>
          <div style={{ fontSize: 24, opacity: 0.7 }}>{SITE_COMMON[locale].footer.hosted}</div>
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: await imageFonts(DEFAULT_THEME),
      headers: { "cache-control": "public, max-age=86400" },
    },
  );
}
