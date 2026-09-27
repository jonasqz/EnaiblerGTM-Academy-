import type { Locale } from "@/core/i18n/locales";
import { SITE_COMMON } from "@/core/i18n/site/common";
import { REPORT } from "@/core/i18n/site/report";
import { legalHref } from "@/core/platform/legal";
import { contentReportMail, newAcademyMail } from "@/core/platform/operator-mail";
import type { ContentReport } from "@/core/platform/report";
import type { TenantContext } from "@/core/tenant/context";
import { sendEmail } from "@/server/email/mailer";
import { renderOperatorMail, renderPlatformNotice } from "@/server/email/templates/platform";
import { env } from "@/server/env";
import { reportError } from "@/server/observability/report";
import {
  academyOrigin,
  isPlatformHost,
  platformOrigin,
  type PlatformConfig,
} from "@/server/platform/config";
import { resolveTenant } from "@/server/tenant-resolver";

/*
 * What the website mails besides sign-in links: content reports to the
 * operator, with a confirmation of receipt for the reporter (DSA Art. 16),
 * and a note to the operator for every new academy. Sent as enaibler, from
 * the platform sender.
 */

function sender(): { name: string; address: string } {
  return { name: "enaibler", address: env().EMAIL_FROM_ADDRESS };
}

/** Whose content an address points at, for the operator. */
async function whereIs(url: string): Promise<string> {
  const host = new URL(url).host;
  if (isPlatformHost(host)) return "enaibler's website";
  const tenant = await resolveTenant(host).catch(() => undefined);
  if (tenant === undefined) return "Unknown: the academy could not be looked up";
  if (!tenant) return "Not an address of this deployment";
  const status = tenant.status === "active" ? "" : `, ${tenant.status}`;
  return `Academy "${tenant.settings.author_display_name}" (${tenant.slug}${status})`;
}

/** The report to the operator. Throws when it could not be sent: the reporter must know. */
export async function sendContentReport(input: {
  to: string;
  report: ContentReport;
  reference: string;
  receivedAt: Date;
  locale: Locale;
}): Promise<void> {
  const mail = contentReportMail({ ...input, where: await whereIs(input.report.url) });
  await sendEmail({
    to: input.to,
    from: sender(),
    // The operator answers the reporter straight from the inbox.
    replyTo: input.report.email ?? undefined,
    ...(await renderOperatorMail(mail)),
  });
}

/**
 * The confirmation of receipt (DSA Art. 16(4)). It repeats nothing the
 * reporter typed: the form must not become a way to mail anyone any text.
 */
export async function confirmContentReport(input: {
  config: PlatformConfig;
  to: string;
  reference: string;
  receivedAt: Date;
  locale: Locale;
}): Promise<void> {
  const copy = REPORT[input.locale].mail;
  const common = SITE_COMMON[input.locale].footer;
  const origin = platformOrigin(input.config);
  // Built-in pages in the language of the mail; the operator's own pages as they are.
  const absolute = (href: string) =>
    href.startsWith("/") ? `${origin}${href}?lang=${input.locale}` : href;
  const date = new Intl.DateTimeFormat(input.locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "long",
    timeZone: "Europe/Berlin",
  }).format(input.receivedAt);
  try {
    const rendered = await renderPlatformNotice({
      locale: input.locale,
      subject: copy.subject.replace("{reference}", input.reference),
      heading: copy.heading,
      paragraphs: [
        copy.body.replace("{date}", date),
        copy.reference.replace("{reference}", input.reference),
      ],
      note: copy.note,
      links: [
        { label: common.imprint, href: absolute(legalHref("imprint", input.config.links)) },
        { label: common.privacy, href: absolute(legalHref("privacy", input.config.links)) },
      ],
    });
    await sendEmail({
      to: input.to,
      from: sender(),
      ...rendered,
      headers: { "Auto-Submitted": "auto-replied" },
    });
  } catch (error) {
    // The operator has the report; a lost confirmation is reported, not the reporter's problem.
    await reportError(error, { runtime: "web", route: "/report", extra: { kind: "confirmation" } });
  }
}

/** The operator hears of every new academy; best effort, never failing the signup. */
export async function notifyNewAcademy(input: {
  to: string;
  tenant: TenantContext;
  adminEmail: string;
}): Promise<void> {
  const { tenant } = input;
  try {
    const mail = newAcademyMail({
      name: tenant.settings.author_display_name,
      slug: tenant.slug,
      url: academyOrigin(tenant.primaryDomain).origin,
      adminEmail: input.adminEmail,
      locales: tenant.settings.locales,
      website: tenant.settings.website ?? null,
      createdAt: new Date(),
    });
    await sendEmail({
      to: input.to,
      from: sender(),
      ...(await renderOperatorMail(mail)),
      headers: { "Auto-Submitted": "auto-generated" },
    });
  } catch (error) {
    await reportError(error, { runtime: "web", route: "/create", tenant: tenant.slug });
  }
}
