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
  /** Tenant term for the current locale, as a label or heading ("Lessons"). */
  term(key: TermKey, options?: { plural?: boolean }): string;
}

/**
 * {term.x} singular, {terms.x} plural, {terms.x:n} plural unless the variable
 * n is 1 ("1 lesson", "3 lessons"), {name} a variable. A term that starts the
 * text or a sentence is written as a label; inside a sentence, platform nouns
 * are lower case in English ("Take this course yourself").
 */
const PLACEHOLDER = /\{(?:(term|terms)\.([a-z]+)(?::([A-Za-z0-9_]+))?|([A-Za-z0-9_]+))\}/g;
/** What comes before a term that starts the text or a sentence. */
const SENTENCE_START = /(^|[.!?]\s*|\n\s*)$/;

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
      (
        match,
        kind: string | undefined,
        termKey: string | undefined,
        countVar: string | undefined,
        name: string | undefined,
        offset: number,
      ) => {
        if (kind && termKey && termKey in terms) {
          const one = countVar !== undefined && Number(vars[countVar]) === 1;
          const plural = kind === "terms" && !one;
          const forms = SENTENCE_START.test(template.slice(0, offset))
            ? terms[termKey as TermKey]
            : terms[termKey as TermKey].inSentence;
          return plural ? forms.other : forms.one;
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
