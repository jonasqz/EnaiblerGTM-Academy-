import type { Metadata } from "next";

import { BrandEditor } from "@/app/studio/settings/brand/brand-editor";
import { createTranslator } from "@/core/i18n/translator";
import { sameJson } from "@/core/shared/json";
import { DEFAULT_THEME } from "@/core/theme/enaibler-tokens";
import { FONT_LIBRARY } from "@/core/theme/fonts";
import { requireCapability } from "@/server/access";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("brand.title") };
}

export default async function BrandPage() {
  const { tenant } = await requireCapability("academy.manage", "/studio/settings/brand");
  // The preview's sample learner text is English, and so are the academy's nouns in it.
  const terms = createTranslator({ locale: "en", termOverrides: tenant.terminology });
  return (
    <BrandEditor
      initial={tenant.theme}
      isDefault={sameJson(tenant.theme, DEFAULT_THEME)}
      academyName={tenant.settings.author_display_name}
      courseTerm={terms.term("course")}
      lessonTerm={terms.term("lesson")}
      website={tenant.settings.website ?? ""}
      fonts={FONT_LIBRARY}
    />
  );
}
