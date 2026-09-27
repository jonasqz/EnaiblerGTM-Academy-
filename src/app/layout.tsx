import "./globals.css";
import "./fonts";

import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { fontFaceCss, themeToCssVariables } from "@/core/theme/css";
import { DEFAULT_THEME } from "@/core/theme/enaibler-tokens";
import { getOrigin, getSurface, getTranslator } from "@/server/request";

export async function generateMetadata(): Promise<Metadata> {
  const surface = await getSurface();
  const name = surface.kind === "tenant" ? surface.tenant.settings.author_display_name : "enaibler";
  const logo = surface.kind === "tenant" ? surface.tenant.theme.logo : undefined;
  return {
    metadataBase: new URL(await getOrigin()),
    title: { default: name, template: `%s · ${name}` },
    applicationName: name,
    ...(logo ? { icons: { icon: logo.png ?? logo.src } } : {}),
  };
}

/**
 * Theme via CSS variables resolved at request time (brief §11): the academy's
 * tokens on academy hosts, enaibler's own on the platform site.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const surface = await getSurface();
  const t = await getTranslator();
  const theme = surface.kind === "tenant" ? surface.tenant.theme : DEFAULT_THEME;
  const faces = fontFaceCss(theme);
  return (
    <html lang={t.locale} style={themeToCssVariables(theme) as CSSProperties}>
      <head>
        {/* Self-hosted only (see core/theme/schema.ts): uploads and vetted stylesheets. */}
        {theme.fonts.source_urls.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
        {faces && <style dangerouslySetInnerHTML={{ __html: faces }} />}
      </head>
      <body className="flex min-h-dvh flex-col bg-surface font-body text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
