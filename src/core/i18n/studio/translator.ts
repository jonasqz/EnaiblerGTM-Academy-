import type { Locale } from "@/core/i18n/locales";
import { STUDIO_MESSAGES, type StudioKey } from "@/core/i18n/studio/index";

type PluralBase<K> = K extends `${infer Base}.one` ? Base : never;
export type StudioPluralKey = PluralBase<StudioKey>;
export type StudioVars = Record<string, string | number | null | undefined>;

export interface StudioText {
  locale: Locale;
  t(key: StudioKey, vars?: StudioVars): string;
  /** `key.one` or `key.other` for `count` (also available as {n}). */
  n(key: StudioPluralKey, count: number, vars?: StudioVars): string;
  date(value: Date | string | number, style?: "date" | "dateTime" | "time" | "short"): string;
  number(value: number, options?: Intl.NumberFormatOptions): string;
  /** "A, B and C" / "A, B und C". */
  list(items: readonly string[]): string;
}

/** Studio users in the EU: times in Berlin time unless the operator says otherwise. */
export const DEFAULT_TIME_ZONE = "Europe/Berlin";

const INTL_LOCALE: Record<Locale, string> = { en: "en-GB", de: "de-DE" };

export function studioText(locale: Locale, options: { timeZone?: string } = {}): StudioText {
  const messages = STUDIO_MESSAGES[locale];
  const intl = INTL_LOCALE[locale];
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
  const numbers = new Intl.NumberFormat(intl);
  const plural = new Intl.PluralRules(intl);
  const formats = {
    date: new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeZone }),
    dateTime: new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeStyle: "short", timeZone }),
    time: new Intl.DateTimeFormat(intl, { timeStyle: "short", timeZone }),
    short: new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", timeZone }),
  };
  const fill = (template: string, vars: StudioVars = {}) =>
    template.replace(/\{(\w+)\}/g, (whole, name: string) => {
      const value = vars[name];
      if (value === undefined || value === null) return whole;
      return typeof value === "number" ? numbers.format(value) : value;
    });
  const t = (key: StudioKey, vars?: StudioVars) => fill(messages[key] ?? String(key), vars);
  return {
    locale,
    t,
    n: (key, count, vars) => {
      const form = plural.select(count) === "one" ? "one" : "other";
      return t(`${key}.${form}` as StudioKey, { n: count, ...vars });
    },
    date: (value, style = "date") => formats[style].format(new Date(value)),
    number: (value, formatOptions) =>
      formatOptions
        ? new Intl.NumberFormat(intl, formatOptions).format(value)
        : numbers.format(value),
    list: (items) => new Intl.ListFormat(intl, { type: "conjunction" }).format(items),
  };
}
