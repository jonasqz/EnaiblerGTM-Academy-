"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/app/studio/actions";
import { wording } from "@/app/studio/form-data";
import type { WordingContext } from "@/core/compliance/wording-lint";
import { isLocale, type Locale, type LocalizedText } from "@/core/i18n/locales";
import type { StudioKey } from "@/core/i18n/studio/index";
import type { StudioText } from "@/core/i18n/studio/translator";
import { FEATURE_KEYS } from "@/core/tenant/manifest";
import { termOverrideEntries } from "@/core/terminology/terms";
import { themeSchema, type ThemeInput } from "@/core/theme/schema";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { updateAcademySettings, updateAcademyTheme } from "@/server/studio/academy";
import { getStudioText } from "@/server/studio-text";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** "acme.com/imprint" → "https://acme.com/imprint"; "" stays empty. */
function httpsUrl(value: string): string | undefined {
  if (!value) return undefined;
  return /^https?:\/\//i.test(value) ? value.replace(/^http:/i, "https:") : `https://${value}`;
}

export async function saveAcademySettingsAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const { tenant } = await requireCapability("academy.manage", "/studio/settings");
  const t = await getStudioText();
  const locales = formData.getAll("locales").filter((value): value is Locale => isLocale(value));
  const requestedDefault = text(formData, "defaultLocale");
  const defaultLocale =
    isLocale(requestedDefault) && locales.includes(requestedDefault)
      ? requestedDefault
      : locales[0];
  if (!defaultLocale) return { errors: [t.t("settings.academy.noLanguage")] };

  const ctaLabel: LocalizedText = {};
  for (const locale of locales) {
    const label = text(formData, `cta.${locale}`);
    if (label) ctaLabel[locale] = label;
  }
  const name = text(formData, "name");
  // Linted first: the manifest check below would word these findings in English.
  const lint = wording(t, [
    [name, "brand_name"],
    [ctaLabel, "cta_label"],
    ...termOverrideEntries(tenant.terminology).map((entry): [string, WordingContext] => [
      entry.text,
      "terminology",
    ]),
  ]);
  if (lint.blocking) return { errors: lint.errors };

  const result = await updateAcademySettings(getDb(), tenant, {
    name,
    locales: [defaultLocale, ...locales.filter((locale) => locale !== defaultLocale)],
    defaultLocale,
    website: httpsUrl(text(formData, "website")) ?? null,
    replyTo: text(formData, "replyTo") || null,
    legalLinks: {
      imprint: httpsUrl(text(formData, "imprint")),
      privacy: httpsUrl(text(formData, "privacy")),
      terms: httpsUrl(text(formData, "terms")),
    },
    ctaLabel:
      Object.keys(ctaLabel).length > 0 ? ctaLabel : { en: "Start this course", de: "Kurs starten" },
    features: Object.fromEntries(
      FEATURE_KEYS.map((key) => [key, formData.get(`feature.${key}`) === "on"]),
    ) as Record<(typeof FEATURE_KEYS)[number], boolean>,
  });
  if (!result.ok) return { errors: result.errors.map((error) => readable(t, error)) };
  revalidatePath("/", "layout");
  return { ok: true, message: t.t("settings.academy.saved"), warnings: result.warnings };
}

export async function saveThemeAction(_: FormState, formData: FormData): Promise<FormState> {
  const { tenant } = await requireCapability("academy.manage", "/studio/settings/brand");
  const t = await getStudioText();
  let theme: ThemeInput | null = null;
  if (formData.get("reset") !== "1") {
    try {
      const parsed = themeSchema.safeParse(JSON.parse(text(formData, "theme")));
      if (!parsed.success) return { errors: parsed.error.issues.map((issue) => issue.message) };
      theme = JSON.parse(text(formData, "theme")) as ThemeInput;
    } catch {
      return { errors: [t.t("settings.theme.unreadable")] };
    }
  }
  const result = await updateAcademyTheme(getDb(), tenant, theme);
  if (!result.ok) return { errors: result.errors };
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: theme ? t.t("settings.theme.saved") : t.t("settings.theme.reset"),
    warnings: result.warnings,
  };
}

/** Manifest paths ("tenant.legal_links.imprint: …") mean nothing to an academy admin. */
function readable(t: StudioText, error: string): string {
  const field = (key: StudioKey) => `${t.t(key)}: `;
  const labels: Array<[RegExp, string]> = [
    [/^tenant\.author_display_name: /, field("settings.academy.field.name")],
    [/^tenant\.legal_links\.imprint: /, field("settings.academy.field.imprint")],
    [/^tenant\.legal_links\.privacy: /, field("settings.academy.field.privacy")],
    [/^tenant\.legal_links\.terms: /, field("settings.academy.field.terms")],
    [/^tenant\.website: /, field("settings.academy.website")],
    [/^tenant\.email_sender\.reply_to: /, field("settings.academy.replyTo")],
    [/^tenant\.verification_cta\.label[.\w]*: /, field("settings.academy.field.cta")],
    [/^tenant\.[\w.]+: /, ""],
  ];
  for (const [pattern, label] of labels)
    if (pattern.test(error)) return error.replace(pattern, label);
  return error;
}
