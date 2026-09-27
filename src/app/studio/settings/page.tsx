import { AcademyForm } from "@/app/studio/settings/academy-form";
import { SUPPORTED_LOCALES } from "@/core/i18n/locales";
import { requireCapability } from "@/server/access";
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
      legalLinks={settings.legal_links}
      ctaLabel={settings.verification_cta.label}
    />
  );
}
