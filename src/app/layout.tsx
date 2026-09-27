import "./globals.css";
import "./fonts";

import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { themeToCssVariables } from "@/core/theme/css";
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
  return (
    <html
      lang={t.locale}
      style={themeToCssVariables(tenant.theme) as CSSProperties}
      data-visual-style={tenant.theme.visual_style}
    >
      <body className="flex min-h-dvh flex-col bg-surface font-body text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
