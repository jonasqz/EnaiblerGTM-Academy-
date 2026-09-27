"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/app/studio/actions";
import { isLocale, type Locale, type LocalizedText } from "@/core/i18n/locales";
import { themeSchema, type ThemeInput } from "@/core/theme/schema";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { updateAcademySettings, updateAcademyTheme } from "@/server/studio/academy";

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
  const locales = formData.getAll("locales").filter((value): value is Locale => isLocale(value));
  const requestedDefault = text(formData, "defaultLocale");
  const defaultLocale =
    isLocale(requestedDefault) && locales.includes(requestedDefault)
      ? requestedDefault
      : locales[0];
  if (!defaultLocale) return { errors: ["Offer at least one language."] };

  const ctaLabel: LocalizedText = {};
  for (const locale of locales) {
    const label = text(formData, `cta.${locale}`);
    if (label) ctaLabel[locale] = label;
  }
  const result = await updateAcademySettings(getDb(), tenant, {
    name: text(formData, "name"),
    locales: [defaultLocale, ...locales.filter((locale) => locale !== defaultLocale)],
    defaultLocale,
    website: httpsUrl(text(formData, "website")) ?? null,
    legalLinks: {
      imprint: httpsUrl(text(formData, "imprint")),
      privacy: httpsUrl(text(formData, "privacy")),
      terms: httpsUrl(text(formData, "terms")),
    },
    ctaLabel:
      Object.keys(ctaLabel).length > 0 ? ctaLabel : { en: "Start this course", de: "Kurs starten" },
  });
  if (!result.ok) return { errors: result.errors.map(readable) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved.", warnings: result.warnings };
}

export async function saveThemeAction(_: FormState, formData: FormData): Promise<FormState> {
  const { tenant } = await requireCapability("academy.manage", "/studio/settings/brand");
  let theme: ThemeInput | null = null;
  if (formData.get("reset") !== "1") {
    try {
      const parsed = themeSchema.safeParse(JSON.parse(text(formData, "theme")));
      if (!parsed.success) return { errors: parsed.error.issues.map((issue) => issue.message) };
      theme = JSON.parse(text(formData, "theme")) as ThemeInput;
    } catch {
      return { errors: ["The brand settings could not be read. Reload the page and try again."] };
    }
  }
  const result = await updateAcademyTheme(getDb(), tenant, theme);
  if (!result.ok) return { errors: result.errors };
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: theme
      ? "Brand saved. Your academy looks like this now."
      : "Back to enaibler's default look.",
    warnings: result.warnings,
  };
}

/** Manifest paths ("tenant.legal_links.imprint: …") mean nothing to an academy admin. */
function readable(error: string): string {
  const labels: Array<[RegExp, string]> = [
    [/^tenant\.author_display_name: /, "Academy name: "],
    [/^tenant\.legal_links\.(\w+): /, "Legal page ($1): "],
    [/^tenant\.website: /, "Website: "],
    [/^tenant\.verification_cta\.label[.\w]*: /, "Certificate button: "],
    [/^tenant\.[\w.]+: /, ""],
  ];
  for (const [pattern, label] of labels)
    if (pattern.test(error)) return error.replace(pattern, label);
  return error;
}
