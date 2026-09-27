import {
  hasBlockingWording,
  lintLocalizedWording,
  lintWording,
  type WordingContext,
} from "@/core/compliance/wording-lint";
import type { Locale, LocalizedText } from "@/core/i18n/locales";
import { wordingText } from "@/core/i18n/studio/helpers";
import type { StudioText } from "@/core/i18n/studio/translator";

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

/** Wording lint over several fields: errors block saving, warnings are shown. */
export function wording(t: StudioText, checks: Array<[LocalizedText | string, WordingContext]>) {
  const findings = checks.flatMap(([value, context]) =>
    typeof value === "string" ? lintWording(value, context) : lintLocalizedWording(value, context),
  );
  return {
    blocking: hasBlockingWording(findings),
    errors: findings
      .filter((finding) => finding.severity === "error")
      .map((finding) => wordingText(t, finding)),
    warnings: findings
      .filter((finding) => finding.severity === "warning")
      .map((finding) => wordingText(t, finding)),
  };
}
