import { localize, type Locale, type LocalizedText } from "@/core/i18n/locales";
import { MESSAGES, type MessageKey } from "@/core/i18n/messages";
import {
  resolveTerms,
  type ResolvedTerms,
  type TermKey,
  type TermOverrides,
} from "@/core/terminology/terms";

export type MessageOverrides = Partial<Record<MessageKey, LocalizedText>>;
export type MessageVars = Record<string, string | number>;

export interface Translator {
  locale: Locale;
  terms: ResolvedTerms;
  t(key: MessageKey, vars?: MessageVars): string;
  /** Tenant term for the current locale. */
  term(key: TermKey, options?: { plural?: boolean }): string;
}

const PLACEHOLDER = /\{(?:(term|terms)\.([a-z]+)|([A-Za-z0-9_]+))\}/g;

export function createTranslator(options: {
  locale: Locale;
  termOverrides?: TermOverrides;
  messageOverrides?: MessageOverrides;
}): Translator {
  const { locale, termOverrides, messageOverrides } = options;
  const terms = resolveTerms(termOverrides, locale);

  const term: Translator["term"] = (key, opts) => {
    const forms = terms[key];
    return opts?.plural ? forms.other : forms.one;
  };

  const t: Translator["t"] = (key, vars = {}) => {
    // A tenant override only applies to locales it provides; others keep the platform copy.
    const template = messageOverrides?.[key]?.[locale] ?? MESSAGES[locale][key];
    return template.replace(
      PLACEHOLDER,
      (match, kind: string | undefined, termKey: string | undefined, name: string | undefined) => {
        if (kind && termKey && termKey in terms) {
          return term(termKey as TermKey, { plural: kind === "terms" });
        }
        if (name !== undefined && name in vars) return String(vars[name]);
        return match;
      },
    );
  };

  return { locale, terms, t, term };
}

/** Localizes tenant content (course titles etc.) with the tenant's fallback order. */
export function localizeFor(
  text: LocalizedText | null | undefined,
  locale: Locale,
  tenant: { defaultLocale: Locale },
): string {
  return localize(text, locale, [tenant.defaultLocale]);
}
