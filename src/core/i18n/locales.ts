import { z } from "zod";

/** Locales the platform ships UI strings for. Tenants enable a subset. */
export const SUPPORTED_LOCALES = ["de", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const localeSchema = z.enum(SUPPORTED_LOCALES);

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Learner-facing text is stored per locale: `{ de: "...", en: "..." }`.
 * At least one locale must be present; missing locales fall back (see `localize`).
 */
export const localizedTextSchema = z
  .partialRecord(localeSchema, z.string().trim().min(1))
  .refine((value) => Object.keys(value).length > 0, "Provide text for at least one locale");

export type LocalizedText = z.infer<typeof localizedTextSchema>;

/**
 * Config shorthand: a plain string means "the same text in every locale"
 * (useful for proper names such as "Validator" or "Loot").
 */
export const localizedTextInputSchema = z
  .union([z.string().trim().min(1), localizedTextSchema])
  .transform((value): LocalizedText =>
    typeof value === "string" ? sameInAllLocales(value) : value,
  );

export function sameInAllLocales(text: string): LocalizedText {
  return Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, text])) as LocalizedText;
}

/**
 * Picks the best available translation: requested locale, then the given
 * fallbacks in order, then any locale that has text.
 */
export function localize(
  text: LocalizedText | null | undefined,
  locale: Locale,
  fallbacks: readonly Locale[] = [],
): string {
  if (!text) return "";
  for (const candidate of [locale, ...fallbacks]) {
    const value = text[candidate];
    if (value) return value;
  }
  for (const candidate of SUPPORTED_LOCALES) {
    const value = text[candidate];
    if (value) return value;
  }
  return "";
}

/** All strings contained in a localized text, for linting. */
export function localizedEntries(text: LocalizedText): Array<[Locale, string]> {
  return SUPPORTED_LOCALES.flatMap((locale) => {
    const value = text[locale];
    return value ? [[locale, value] as [Locale, string]] : [];
  });
}

/**
 * Resolves the UI locale: explicit choice (if the tenant offers it), then the
 * best Accept-Language match, then the tenant default.
 */
export function resolveLocale(options: {
  requested?: string | null;
  acceptLanguage?: string | null;
  tenantLocales: readonly Locale[];
  defaultLocale: Locale;
}): Locale {
  const { requested, acceptLanguage, tenantLocales, defaultLocale } = options;
  if (isLocale(requested) && tenantLocales.includes(requested)) return requested;

  if (acceptLanguage) {
    const ranked = acceptLanguage
      .split(",")
      .map((part) => {
        const [tag = "", ...params] = part.trim().split(";");
        const q = params.find((p) => p.trim().startsWith("q="));
        const quality = q ? Number.parseFloat(q.trim().slice(2)) : 1;
        return {
          base: tag.toLowerCase().split("-")[0] ?? "",
          quality: Number.isNaN(quality) ? 0 : quality,
        };
      })
      .filter((entry) => entry.quality > 0)
      .sort((a, b) => b.quality - a.quality);
    for (const { base } of ranked) {
      if (isLocale(base) && tenantLocales.includes(base)) return base;
    }
  }

  return defaultLocale;
}
