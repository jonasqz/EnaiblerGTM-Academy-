import "./globals.css";
import "./fonts";

import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { themeToCssVariables } from "@/core/theme/css";
import { getViewer } from "@/server/auth";
import { getOrigin, getTenant, getTranslator } from "@/server/request";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenant();
  const name = tenant.settings.author_display_name;
  return {
    metadataBase: new URL(await getOrigin()),
    title: { default: name, template: `%s · ${name}` },
    applicationName: name,
  };
}

/** Theme via CSS variables resolved from the tenant's tokens at request time (brief §11). */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const tenant = await getTenant();
  const t = await getTranslator();
  const viewer = await getViewer(tenant);

  return (
    <html
      lang={t.locale}
      style={themeToCssVariables(tenant.theme) as CSSProperties}
      data-visual-style={tenant.theme.visual_style}
    >
      <body className="flex min-h-dvh flex-col bg-surface font-body text-ink antialiased">
        <SiteHeader
          academyName={tenant.settings.author_display_name}
          t={t}
          locales={tenant.settings.locales}
          signedIn={viewer !== null}
        />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        <SiteFooter tenant={tenant} t={t} />
      </body>
    </html>
  );
}
