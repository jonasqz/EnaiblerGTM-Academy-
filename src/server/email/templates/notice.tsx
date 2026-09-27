import { render } from "@react-email/render";

import type { Translator } from "@/core/i18n/translator";
import type { TenantContext } from "@/core/tenant/context";
import { EmailButton, EmailFooter, EmailLayout } from "@/server/email/templates/layout";

export interface NoticeEmailInput {
  tenant: TenantContext;
  t: Translator;
  subject: string;
  heading: string;
  paragraphs: string[];
  button: { label: string; url: string };
  /** Small print under the button (e.g. how long a link works). */
  note?: string;
  /** Why the learner gets this mail, first line of the footer. */
  reason?: string;
}

/** One message, one button: review ready, level-up, the marketing confirmation. */
export async function renderNoticeEmail(
  input: NoticeEmailInput,
): Promise<{ subject: string; html: string; text: string }> {
  const { tenant, t } = input;
  const element = (
    <EmailLayout
      theme={tenant.theme}
      lang={t.locale}
      academyName={tenant.settings.author_display_name}
      preview={input.subject}
      footer={<EmailFooter tenant={tenant} t={t} reason={input.reason} />}
    >
      <h1 style={{ fontSize: 22, lineHeight: 1.3, margin: "0 0 12px" }}>{input.heading}</h1>
      {input.paragraphs.map((paragraph, index) => (
        <p key={index} style={{ margin: "0 0 16px" }}>
          {paragraph}
        </p>
      ))}
      <p style={{ margin: "8px 0 20px" }}>
        <EmailButton theme={tenant.theme} href={input.button.url}>
          {input.button.label}
        </EmailButton>
      </p>
      {input.note && <p style={{ margin: 0, fontSize: 13 }}>{input.note}</p>}
    </EmailLayout>
  );
  return {
    subject: input.subject,
    html: await render(element),
    text: await render(element, { plainText: true }),
  };
}
