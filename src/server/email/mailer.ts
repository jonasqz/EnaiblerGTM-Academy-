import nodemailer, { type Transporter } from "nodemailer";

import type { TenantContext } from "@/core/tenant/context";
import { env } from "@/server/env";

/**
 * Transactional mail (magic link, review ready, level-up) goes through the EU
 * SMTP relay. Marketing mail is a separate path with double opt-in and is not
 * sent from here (brief §9).
 */
export interface OutgoingEmail {
  to: string;
  from: { name: string; address: string };
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}

let transport: Transporter | null = null;

export function senderFor(tenant: TenantContext): {
  name: string;
  address: string;
  replyTo?: string;
} {
  const configured = tenant.settings.email_sender;
  if (configured)
    return { name: configured.name, address: configured.address, replyTo: configured.reply_to };
  // The brand, never a person (anonymity mode): "Scaling Product Academy <academy@…>".
  return { name: tenant.settings.author_display_name, address: env().EMAIL_FROM_ADDRESS };
}

export async function sendEmail(mail: OutgoingEmail): Promise<void> {
  const { SMTP_URL, NODE_ENV } = env();
  if (!SMTP_URL) {
    if (NODE_ENV === "production") throw new Error("SMTP_URL is not configured");
    console.info(`[email] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }
  transport ??= nodemailer.createTransport(SMTP_URL);
  await transport.sendMail({
    to: mail.to,
    from: { name: mail.from.name, address: mail.from.address },
    replyTo: mail.replyTo,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
}
