import { AcademyForm } from "@/app/studio/settings/academy-form";
import { SUPPORTED_LOCALES } from "@/core/i18n/locales";
import { requireCapability } from "@/server/access";
import { senderFor } from "@/server/email/mailer";
import { academyOrigin } from "@/server/platform/config";

export default async function AcademySettingsPage() {
  const { tenant } = await requireCapability("academy.manage", "/studio/settings");
  const { settings } = tenant;
  return (
    <AcademyForm
      address={academyOrigin(tenant.primaryDomain).origin}
      name={settings.author_display_name}
      locales={settings.locales}
      defaultLocale={settings.default_locale}
      allLocales={SUPPORTED_LOCALES}
      website={settings.website ?? ""}
      sender={`${senderFor(tenant).name} <${senderFor(tenant).address}>`}
      replyTo={settings.email_sender?.reply_to ?? ""}
      legalLinks={settings.legal_links}
      features={settings.features}
      videoWatchedPercent={settings.video.watched_percent}
      lateSubmissions={settings.assignments.late_submissions}
    />
  );
}
