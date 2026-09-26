import { render } from "@react-email/render";

import type { Translator } from "@/core/i18n/translator";
import type { TenantContext } from "@/core/tenant/context";
import { mostReadable } from "@/core/theme/color";
import { EmailLayout } from "@/server/email/templates/layout";

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
  const buttonText =
    theme.colors.on_primary ?? mostReadable(theme.colors.primary, [theme.colors.ink, "#FFFFFF"]);

  const element = (
    <EmailLayout
      theme={theme}
      lang={t.locale}
      academyName={academy}
      preview={subject}
      footer={
        <>
          {academy} ·{" "}
          <a href={tenant.settings.legal_links.imprint} style={{ color: "inherit" }}>
            {t.t("footer.imprint")}
          </a>{" "}
          ·{" "}
          <a href={tenant.settings.legal_links.privacy} style={{ color: "inherit" }}>
            {t.t("footer.privacy")}
          </a>
          <br />
          {t.t("app.poweredBy")}
        </>
      }
    >
      <h1 style={{ fontSize: 22, lineHeight: 1.3, margin: "0 0 12px" }}>
        {t.t("email.magicLink.heading", { academy })}
      </h1>
      <p style={{ margin: "0 0 20px" }}>
        {t.t("email.magicLink.body", { minutes: input.expiresInMinutes })}
      </p>
      <p style={{ margin: "0 0 20px" }}>
        <a
          href={url}
          style={{
            display: "inline-block",
            padding: "12px 20px",
            backgroundColor: theme.colors.primary,
            color: buttonText,
            border: `${theme.border_width} solid ${theme.colors.ink}`,
            borderRadius: theme.radius === "0px" ? 0 : 10,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          {t.t("email.magicLink.button")}
        </a>
      </p>
      <p style={{ margin: "0 0 8px", fontSize: 13, wordBreak: "break-all" }}>{url}</p>
      <p style={{ margin: 0, fontSize: 13 }}>{t.t("email.magicLink.ignore")}</p>
    </EmailLayout>
  );

  return { subject, html: await render(element), text: await render(element, { plainText: true }) };
}
