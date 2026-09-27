import nodemailer, { type Transporter } from "nodemailer";

import type { TenantContext } from "@/core/tenant/context";

/**
 * Transactional mail (magic link, review ready, level-up, the marketing
 * confirmation link) goes through the EU SMTP relay. Marketing mail itself is
 * never sent from here: the academy exports its confirmed contacts (brief §9).
 */
export interface OutgoingEmail {
  to: string;
  from: { name: string; address: string };
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

/**
 * Read by name, not through env(): the worker sends mail too and has no auth
 * secret, which env() requires.
 */
function mailSettings() {
  return {
    smtpUrl: process.env.SMTP_URL?.trim() || undefined,
    fromAddress: process.env.EMAIL_FROM_ADDRESS?.trim() || "academy@enaibler.local",
    production: process.env.NODE_ENV === "production",
  };
}

let transport: Transporter | null = null;

export function senderFor(tenant: TenantContext): {
  name: string;
  address: string;
  replyTo?: string;
} {
  const configured = tenant.settings.email_sender;
  return {
    // The brand, never a person (anonymity mode): "Scaling Product Academy <academy@…>".
    name: configured?.name ?? tenant.settings.author_display_name,
    address: configured?.address ?? mailSettings().fromAddress,
    replyTo: configured?.reply_to,
  };
}

export type SendEmail = (mail: OutgoingEmail) => Promise<void>;

export const sendEmail: SendEmail = async (mail) => {
  const { smtpUrl, production } = mailSettings();
  if (!smtpUrl) {
    if (production) throw new Error("SMTP_URL is not configured");
    console.info(`[email] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }
  transport ??= nodemailer.createTransport(smtpUrl);
  await transport.sendMail({
    to: mail.to,
    from: { name: mail.from.name, address: mail.from.address },
    replyTo: mail.replyTo,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    headers: mail.headers,
  });
};
