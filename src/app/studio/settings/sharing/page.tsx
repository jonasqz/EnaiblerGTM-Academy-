import type { Metadata } from "next";

import { SharingForm, type PostSample } from "@/app/studio/settings/sharing/sharing-form";
import { COMPLETION_MODES } from "@/core/courses/completion";
import { proofLine } from "@/core/credentials/proof";
import { sharedUrl, suggestedPost, type PostFacts } from "@/core/credentials/share";
import { localize, type LocalizedText } from "@/core/i18n/locales";
import { tenantTranslator } from "@/core/i18n/tenant-translator";
import { slugify } from "@/core/shared/slug";
import { buildVerificationCtaUrl } from "@/core/tenant/manifest";
import { requireCapability } from "@/server/access";
import { academyOrigin } from "@/server/platform/config";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("settings.tab.sharing") };
}

/** Stand-ins for a learner's certificate in the preview; everything else is the academy's real wording. */
const SAMPLE_COURSE: LocalizedText = { en: "Get paid on time", de: "Pünktlich bezahlt werden" };
const SAMPLE_ARTIFACT: LocalizedText = { en: "Reminder playbook", de: "Mahn-Playbook" };
const SAMPLE_PUBLIC_ID = "ABCD2345EFGH6789";

/**
 * How learners share their certificates and where the certificate page
 * leads visitors (brief §2 steps 7–8, §6): the loop that brings new
 * learners and leads.
 */
export default async function SharingSettingsPage() {
  const { tenant } = await requireCapability("academy.manage", "/studio/settings/sharing");
  const { settings } = tenant;
  const origin = academyOrigin(tenant.primaryDomain).origin;
  const url = sharedUrl(`${origin}/verify/${SAMPLE_PUBLIC_ID}`, "post");
  // What learners read, in each language the academy teaches in, worded here with the sample values.
  const samples: PostSample[] = settings.locales.map((locale) => {
    const learner = tenantTranslator(tenant, locale);
    const modes = COMPLETION_MODES.map((basis) => {
      const artifact = basis === "test" ? null : localize(SAMPLE_ARTIFACT, learner.locale);
      const facts: PostFacts = {
        basis,
        course: localize(SAMPLE_COURSE, learner.locale),
        academy: settings.author_display_name,
        artifact,
        proof: proofLine(learner, { basis, artifactName: artifact }),
        url,
      };
      return { facts, enaibler: suggestedPost(learner, facts, { template: null, hashtags: [] }) };
    });
    return { locale, modes };
  });
  const ctaExample = buildVerificationCtaUrl(settings.verification_cta, {
    academyOrigin: origin,
    courseSlug: slugify(localize(SAMPLE_COURSE, settings.default_locale)),
    publicId: SAMPLE_PUBLIC_ID,
    via: "post",
  });

  return (
    <SharingForm
      locales={settings.locales}
      linkedinOrganizationId={settings.linkedin_organization_id ?? ""}
      postText={settings.sharing.post_text ?? {}}
      hashtags={settings.sharing.hashtags.map((tag) => `#${tag}`).join(" ")}
      ctaLabel={settings.verification_cta.label}
      ctaUrl={settings.verification_cta.url ?? ""}
      ctaExample={ctaExample}
      samples={samples}
    />
  );
}
