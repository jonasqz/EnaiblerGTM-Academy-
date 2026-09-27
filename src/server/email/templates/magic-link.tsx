import { render } from "@react-email/render";

import type { Translator } from "@/core/i18n/translator";
import type { TenantContext } from "@/core/tenant/context";
import { EmailButton, EmailFooter, EmailLayout, emailLogo } from "@/server/email/templates/layout";

export interface MagicLinkEmailInput {
  tenant: TenantContext;
  t: Translator;
  url: string;
  expiresInMinutes: number;
}

export async function renderMagicLinkEmail(
  input: MagicLinkEmailInput,
): Promise<{ subject: string; html: string; text: string }> {
  const { tenant, t, url } = input;
  const { theme } = tenant;
  const academy = tenant.settings.author_display_name;
  const subject = t.t("email.magicLink.subject", { academy });

  const element = (
    <EmailLayout
      theme={theme}
      lang={t.locale}
      academyName={academy}
      logo={emailLogo(tenant)}
      preview={subject}
      footer={<EmailFooter tenant={tenant} t={t} />}
    >
      <h1 style={{ fontSize: 22, lineHeight: 1.3, margin: "0 0 12px" }}>
        {t.t("email.magicLink.heading", { academy })}
      </h1>
      <p style={{ margin: "0 0 20px" }}>
        {t.t("email.magicLink.body", { minutes: input.expiresInMinutes })}
      </p>
      <p style={{ margin: "0 0 20px" }}>
        <EmailButton theme={theme} href={url}>
          {t.t("email.magicLink.button")}
        </EmailButton>
      </p>
      <p style={{ margin: "0 0 8px", fontSize: 13, wordBreak: "break-all" }}>{url}</p>
      <p style={{ margin: 0, fontSize: 13 }}>{t.t("email.magicLink.ignore")}</p>
    </EmailLayout>
  );

  return { subject, html: await render(element), text: await render(element, { plainText: true }) };
}
