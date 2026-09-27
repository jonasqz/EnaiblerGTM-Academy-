import type { Metadata } from "next";

import { BrandEditor } from "@/app/studio/settings/brand/brand-editor";
import type { PreviewSample } from "@/app/studio/settings/brand/theme-preview";
import { localize, type LocalizedText } from "@/core/i18n/locales";
import { tenantTranslator } from "@/core/i18n/tenant-translator";
import { sameJson } from "@/core/shared/json";
import { DEFAULT_THEME } from "@/core/theme/enaibler-tokens";
import { FONT_LIBRARY } from "@/core/theme/fonts";
import { requireCapability } from "@/server/access";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("brand.title") };
}

/** Stand-ins for a course in the preview; everything else is the academy's real wording. */
const SAMPLE_COURSE: LocalizedText = {
  en: "Write a validated idea brief",
  de: "Ein belastbares Ideen-Briefing schreiben",
};
const SAMPLE_CRITERION: LocalizedText = {
  en: "Evidence and reasoning",
  de: "Belege und Begründung",
};

export default async function BrandPage() {
  const { tenant } = await requireCapability("academy.manage", "/studio/settings/brand");
  const t = await getStudioText();
  // The preview is what learners read: in the team member's language if the academy offers it.
  const learner = tenantTranslator(tenant, t.locale);
  const sample: PreviewSample = {
    locale: learner.locale,
    signIn: learner.t("nav.signIn"),
    title: learner.t("home.heroTitle"),
    intro: learner.t("home.heroIntro"),
    browse: learner.t("home.browse"),
    course: localize(SAMPLE_COURSE, learner.locale),
    progress: learner.t("home.inProgress", { percent: 66 }),
    lessons: learner.t("home.lessonCount", { n: 3 }),
    minutes: learner.t("home.minutes", { minutes: 90 }),
    passed: learner.t("assignment.passed"),
    criterion: localize(SAMPLE_CRITERION, learner.locale),
  };
  return (
    <BrandEditor
      initial={tenant.theme}
      isDefault={sameJson(tenant.theme, DEFAULT_THEME)}
      academyName={tenant.settings.author_display_name}
      sample={sample}
      website={tenant.settings.website ?? ""}
      fonts={FONT_LIBRARY}
    />
  );
}
