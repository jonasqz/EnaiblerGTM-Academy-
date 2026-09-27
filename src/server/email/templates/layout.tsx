/* eslint-disable @next/next/no-head-element -- e-mail HTML, not a Next.js page */
import type { ReactNode } from "react";

import type { Translator } from "@/core/i18n/translator";
import type { TenantContext } from "@/core/tenant/context";
import { mostReadable } from "@/core/theme/color";
import type { Theme } from "@/core/theme/schema";
import { academyUrl } from "@/server/platform/config";

const FONT_STACK = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Table-based e-mail frame with the tenant's colours. Mail clients ignore
 * CSS variables and web fonts, so tokens are inlined and fonts fall back to
 * system stacks.
 */
export interface EmailLogo {
  /** Absolute URL of a PNG (mail clients do not show SVG). */
  url: string;
  width: number;
  height: number;
  showName: boolean;
}

/** The academy's logo for mail, when it has a PNG version. */
export function emailLogo(tenant: TenantContext): EmailLogo | undefined {
  const logo = tenant.theme.logo;
  const png = logo?.png ?? (logo?.src.endsWith(".png") ? logo.src : undefined);
  if (!logo || !png) return undefined;
  const height = 32;
  return {
    url: academyUrl(tenant, png),
    width: Math.round(height * (logo.ratio ?? 1)),
    height,
    showName: logo.show_name,
  };
}

export function EmailLayout(props: {
  theme: Theme;
  lang: string;
  academyName: string;
  logo?: EmailLogo;
  preview: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  const { theme } = props;
  const radius = theme.radius === "0px" ? "0" : "12px";
  return (
    <html lang={props.lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.preview}</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: theme.colors.surface }}>
        <div style={{ display: "none", maxHeight: 0, overflow: "hidden" }}>{props.preview}</div>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ backgroundColor: theme.colors.surface }}
        >
          <tbody>
            <tr>
              <td align="center" style={{ padding: "32px 16px" }}>
                <table
                  role="presentation"
                  width="100%"
                  cellPadding={0}
                  cellSpacing={0}
                  style={{
                    maxWidth: 520,
                    backgroundColor: theme.colors.card,
                    border: `${theme.border_width} solid ${theme.colors.ink}`,
                    borderRadius: radius,
                    fontFamily: FONT_STACK,
                    color: theme.colors.ink,
                  }}
                >
                  <tbody>
                    <tr>
                      <td
                        style={{
                          padding: "28px 28px 8px",
                          fontSize: 14,
                          fontWeight: 700,
                          letterSpacing: 0.4,
                        }}
                      >
                        {props.logo && (
                          // eslint-disable-next-line @next/next/no-img-element -- e-mail HTML
                          <img
                            src={props.logo.url}
                            width={props.logo.width}
                            height={props.logo.height}
                            alt={props.logo.showName ? "" : props.academyName}
                            style={{ display: "block", border: 0, marginBottom: 8 }}
                          />
                        )}
                        {(!props.logo || props.logo.showName) && props.academyName}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "8px 28px 28px", fontSize: 16, lineHeight: 1.5 }}>
                        {props.children}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <table
                  role="presentation"
                  width="100%"
                  cellPadding={0}
                  cellSpacing={0}
                  style={{ maxWidth: 520 }}
                >
                  <tbody>
                    <tr>
                      <td
                        style={{
                          padding: "16px 8px",
                          fontSize: 12,
                          lineHeight: 1.5,
                          fontFamily: FONT_STACK,
                          color: theme.colors.ink,
                          opacity: 0.7,
                        }}
                      >
                        {props.footer}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

/** The primary button, in the academy's colours. */
export function EmailButton(props: { theme: Theme; href: string; children: ReactNode }) {
  const { theme } = props;
  const text =
    theme.colors.on_primary ?? mostReadable(theme.colors.primary, [theme.colors.ink, "#FFFFFF"]);
  return (
    <a
      href={props.href}
      style={{
        display: "inline-block",
        padding: "12px 20px",
        backgroundColor: theme.colors.primary,
        color: text,
        border: `${theme.border_width} solid ${theme.colors.ink}`,
        borderRadius: theme.radius === "0px" ? 0 : 10,
        fontWeight: 700,
        textDecoration: "none",
      }}
    >
      {props.children}
    </a>
  );
}

/** Brand, legal links and "Powered by enaibler"; optionally why the mail came. */
export function EmailFooter(props: { tenant: TenantContext; t: Translator; reason?: string }) {
  const { tenant, t } = props;
  const links = tenant.settings.legal_links;
  return (
    <>
      {props.reason && (
        <>
          {props.reason}
          <br />
        </>
      )}
      {tenant.settings.author_display_name}
      {links.imprint && (
        <>
          {" · "}
          <a href={links.imprint} style={{ color: "inherit" }}>
            {t.t("footer.imprint")}
          </a>
        </>
      )}
      {links.privacy && (
        <>
          {" · "}
          <a href={links.privacy} style={{ color: "inherit" }}>
            {t.t("footer.privacy")}
          </a>
        </>
      )}
      <br />
      {t.t("app.poweredBy")}
    </>
  );
}
