/* eslint-disable @next/next/no-head-element -- e-mail HTML, not a Next.js page */
import { render } from "@react-email/render";

import type { Locale } from "@/core/i18n/locales";
import { DEFAULT_THEME } from "@/core/theme/enaibler-tokens";
import { EmailLayout } from "@/server/email/templates/layout";

type Rendered = { subject: string; html: string; text: string };

/**
 * Mail from enaibler's website to a visitor (the confirmation of a content
 * report): enaibler's theme and name, because the visitor wrote to enaibler,
 * not to an academy.
 */
export async function renderPlatformNotice(input: {
  locale: Locale;
  subject: string;
  heading: string;
  paragraphs: string[];
  note?: string;
  links: ReadonlyArray<{ label: string; href: string }>;
}): Promise<Rendered> {
  const element = (
    <EmailLayout
      theme={DEFAULT_THEME}
      lang={input.locale}
      academyName="enaibler"
      preview={input.subject}
      footer={
        <>
          enaibler
          {input.links.map((link) => (
            <span key={link.label}>
              {" · "}
              <a href={link.href} style={{ color: "inherit" }}>
                {link.label}
              </a>
            </span>
          ))}
        </>
      }
    >
      <h1 style={{ fontSize: 22, lineHeight: 1.3, margin: "0 0 12px" }}>{input.heading}</h1>
      {input.paragraphs.map((paragraph, index) => (
        <p key={index} style={{ margin: "0 0 16px" }}>
          {paragraph}
        </p>
      ))}
      {input.note && <p style={{ margin: 0, fontSize: 13 }}>{input.note}</p>}
    </EmailLayout>
  );
  return {
    subject: input.subject,
    html: await render(element),
    text: await render(element, { plainText: true }),
  };
}

/** Mail to enaibler's own team: the plain text as written, with an HTML twin that keeps it. */
export async function renderOperatorMail(input: {
  subject: string;
  text: string;
}): Promise<Rendered> {
  const html = await render(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{input.subject}</title>
      </head>
      <body>
        <pre
          style={{
            font: "14px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            whiteSpace: "pre-wrap",
          }}
        >
          {input.text}
        </pre>
      </body>
    </html>,
  );
  return { subject: input.subject, html, text: input.text };
}
