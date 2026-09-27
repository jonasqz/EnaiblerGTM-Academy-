"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/app/studio/actions";
import { localized, text } from "@/app/studio/form-data";
import {
  ctaAddress,
  DEFAULT_CTA_LABEL,
  linkedInPageId,
  parseHashtags,
} from "@/core/credentials/share-settings";
import { postWithoutUrlText, sharingIssueText } from "@/core/i18n/studio/helpers";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { updateSharingSettings } from "@/server/studio/academy";
import { getStudioText } from "@/server/studio-text";

/** The LinkedIn page, the suggested post and the certificate button (Settings → Sharing). */
export async function saveSharingSettingsAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const { tenant } = await requireCapability("academy.manage", "/studio/settings/sharing");
  const t = await getStudioText();
  const locales = tenant.settings.locales;
  const ctaLabel = localized(formData, "cta", locales);
  const result = await updateSharingSettings(getDb(), tenant, {
    linkedinOrganizationId: linkedInPageId(text(formData, "linkedinId")),
    postText: localized(formData, "post", locales),
    hashtags: parseHashtags(text(formData, "hashtags")),
    ctaLabel: Object.keys(ctaLabel).length > 0 ? ctaLabel : DEFAULT_CTA_LABEL,
    ctaUrl: ctaAddress(text(formData, "ctaUrl")),
  });
  if (!result.ok) return { errors: result.issues.map((issue) => sharingIssueText(t, issue)) };
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: t.t("settings.sharing.saved"),
    warnings: result.postsWithoutUrl.map((locale) => postWithoutUrlText(t, locale)),
  };
}
