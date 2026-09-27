import type { Locale, LocalizedText } from "@/core/i18n/locales";

/** Trimmed text field of a form, "" when missing. */
export function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** A `name.<locale>` field per language, empty languages left out. */
export function localized(
  formData: FormData,
  name: string,
  locales: readonly Locale[],
): LocalizedText {
  const out: LocalizedText = {};
  for (const locale of locales) {
    const value = text(formData, `${name}.${locale}`);
    if (value) out[locale] = value;
  }
  return out;
}
