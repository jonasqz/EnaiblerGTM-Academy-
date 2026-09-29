import { render } from "@react-email/render";

import type { Translator } from "@/core/i18n/translator";
import type { TenantContext } from "@/core/tenant/context";
import { EmailButton, EmailFooter, EmailLayout, emailLogo } from "@/server/email/templates/layout";

export interface NoticeEmailInput {
  tenant: TenantContext;
  t: Translator;
  subject: string;
  heading: string;
  paragraphs: string[];
  /** Short lines after the paragraphs, as a list (roles, waiting hand-ins). */
  list?: string[];
  button: { label: string; url: string };
  /** Small print under the button (e.g. how long a link works). */
  note?: string;
  /** A second, quieter way on ("Can't make it? Cancel your registration"). */
  link?: { before?: string; label: string; url: string };
  /** Why the learner gets this mail, first line of the footer. */
  reason?: string;
}

/**
 * One message, one button: review ready, level-up, the marketing confirmation,
 * a webinar's invitations and reminders, and for the team an invitation or
 * hand-ins waiting for review.
 */
export async function renderNoticeEmail(
  input: NoticeEmailInput,
): Promise<{ subject: string; html: string; text: string }> {
  const { tenant, t } = input;
  const element = (
    <EmailLayout
      theme={tenant.theme}
      lang={t.locale}
      academyName={tenant.settings.author_display_name}
      logo={emailLogo(tenant)}
      preview={input.subject}
      footer={<EmailFooter tenant={tenant} t={t} reason={input.reason} />}
    >
      <h1 style={{ fontSize: 22, lineHeight: 1.3, margin: "0 0 12px" }}>{input.heading}</h1>
      {input.paragraphs.map((paragraph, index) => (
        <p key={index} style={{ margin: "0 0 16px" }}>
          {paragraph}
        </p>
      ))}
      {input.list && input.list.length > 0 && (
        <ul style={{ margin: "0 0 16px", paddingLeft: 20 }}>
          {input.list.map((item, index) => (
            <li key={index} style={{ margin: "0 0 6px" }}>
              {item}
            </li>
          ))}
        </ul>
      )}
      <p style={{ margin: "8px 0 20px" }}>
        <EmailButton theme={tenant.theme} href={input.button.url}>
          {input.button.label}
        </EmailButton>
      </p>
      {input.note && <p style={{ margin: 0, fontSize: 13 }}>{input.note}</p>}
      {input.link && (
        <p style={{ margin: "12px 0 0", fontSize: 13 }}>
          {input.link.before && `${input.link.before} `}
          <a href={input.link.url} style={{ color: "inherit" }}>
            {input.link.label}
          </a>
        </p>
      )}
    </EmailLayout>
  );
  return {
    subject: input.subject,
    html: await render(element),
    text: await render(element, { plainText: true }),
  };
}
