import { z } from "zod";

import { SUPPORTED_LOCALES, localeSchema, type Locale } from "@/core/i18n/locales";

/**
 * Product nouns a tenant may rename. Tenant 0 calls paths "Characters" and
 * artifacts "Loot"; the platform defaults are neutral.
 */
export const TERM_KEYS = [
  "path",
  "course",
  "lesson",
  "assignment",
  "artifact",
  "test",
  "level",
  "credential",
] as const;
export type TermKey = (typeof TERM_KEYS)[number];

export interface TermForms {
  one: string;
  other: string;
}

export const DEFAULT_TERMS: Record<TermKey, Record<Locale, TermForms>> = {
  path: {
    en: { one: "Track", other: "Tracks" },
    de: { one: "Lernpfad", other: "Lernpfade" },
  },
  course: {
    en: { one: "Course", other: "Courses" },
    de: { one: "Kurs", other: "Kurse" },
  },
  lesson: {
    en: { one: "Lesson", other: "Lessons" },
    de: { one: "Lektion", other: "Lektionen" },
  },
  assignment: {
    en: { one: "Assignment", other: "Assignments" },
    de: { one: "Aufgabe", other: "Aufgaben" },
  },
  artifact: {
    en: { one: "Deliverable", other: "Deliverables" },
    de: { one: "Arbeitsergebnis", other: "Arbeitsergebnisse" },
  },
  // The final multiple-choice test some courses end with (core/courses/completion).
  test: {
    en: { one: "Final Test", other: "Final Tests" },
    de: { one: "Abschlusstest", other: "Abschlusstests" },
  },
  level: {
    en: { one: "Level", other: "Levels" },
    de: { one: "Level", other: "Level" },
  },
  // Never "certified"/"zertifiziert" (see compliance/wording-lint.ts). The German
  // wording avoids "Zertifikat" altogether; confirm with counsel.
  credential: {
    en: { one: "Certificate of Completion", other: "Certificates of Completion" },
    de: { one: "Abschlussbescheinigung", other: "Abschlussbescheinigungen" },
  },
};

const termText = z.string().trim().min(1).max(60);

/** Per locale either a single word (used for singular and plural) or both forms. */
const termFormsInputSchema = z.union([
  termText,
  z.strictObject({ one: termText, other: termText }),
]);

export const termOverrideSchema = z.partialRecord(localeSchema, termFormsInputSchema);
export type TermOverride = z.infer<typeof termOverrideSchema>;

export const termOverridesSchema = z.partialRecord(z.enum(TERM_KEYS), termOverrideSchema);
export type TermOverrides = z.infer<typeof termOverridesSchema>;

function toForms(value: string | TermForms): TermForms {
  return typeof value === "string" ? { one: value, other: value } : value;
}

/**
 * Platform nouns that are ordinary English words: capitalised as a label
 * ("Lessons"), lower case inside a sentence ("1 of 3 lessons done"). Named
 * things (the Certificate of Completion, the Final Test) and a tenant's own
 * terms keep their spelling everywhere; German capitalises nouns anyway.
 */
const COMMON_NOUNS: ReadonlySet<TermKey> = new Set([
  "path",
  "course",
  "lesson",
  "assignment",
  "artifact",
  "level",
]);

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** A noun's forms as a label, and inside a sentence. */
export interface ResolvedTerm extends TermForms {
  inSentence: TermForms;
}

/** Resolved nouns for one locale, with tenant overrides applied. */
export type ResolvedTerms = Record<TermKey, ResolvedTerm>;

export function resolveTerms(overrides: TermOverrides | undefined, locale: Locale): ResolvedTerms {
  const resolved = {} as ResolvedTerms;
  for (const key of TERM_KEYS) {
    const override = overrides?.[key]?.[locale];
    const forms = override ? toForms(override) : DEFAULT_TERMS[key][locale];
    const common = !override && locale === "en" && COMMON_NOUNS.has(key);
    resolved[key] = {
      ...forms,
      inSentence: common ? { one: lowerFirst(forms.one), other: lowerFirst(forms.other) } : forms,
    };
  }
  return resolved;
}

/** Every override string, for the wording lint. */
export function termOverrideEntries(
  overrides: TermOverrides | undefined,
): Array<{ key: TermKey; locale: Locale; text: string }> {
  if (!overrides) return [];
  const entries: Array<{ key: TermKey; locale: Locale; text: string }> = [];
  for (const key of TERM_KEYS) {
    for (const locale of SUPPORTED_LOCALES) {
      const value = overrides[key]?.[locale];
      if (!value) continue;
      const forms = toForms(value);
      entries.push({ key, locale, text: forms.one });
      if (forms.other !== forms.one) entries.push({ key, locale, text: forms.other });
    }
  }
  return entries;
}
