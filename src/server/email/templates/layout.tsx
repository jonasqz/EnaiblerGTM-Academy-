/* eslint-disable @next/next/no-head-element -- e-mail HTML, not a Next.js page */
import type { ReactNode } from "react";

import type { Theme } from "@/core/theme/schema";

/**
 * Table-based e-mail frame with the tenant's colours. Mail clients ignore
 * CSS variables and web fonts, so tokens are inlined and fonts fall back to
 * system stacks.
 */
export function EmailLayout(props: {
  theme: Theme;
  lang: string;
  academyName: string;
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
                    fontFamily: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
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
                        {props.academyName}
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
