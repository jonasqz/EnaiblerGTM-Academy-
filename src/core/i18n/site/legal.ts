import type { Locale } from "@/core/i18n/locales";

/*
 * Around enaibler's legal pages (the texts themselves: content/legal). A page
 * that is not final says so before anything else.
 */

const en = {
  updated: "Last updated: {date}",
  draft: {
    title: "Draft: not in force",
    body: "This text is a first draft that counsel is still reviewing. It does not apply yet, and it will change before it does.",
  },
  /** For search results, when a document brings no description of its own. */
  description: "{title} of enaibler, the platform for academies that end in real work.",
};

export type LegalCopy = typeof en;

const de: LegalCopy = {
  updated: "Stand: {date}",
  draft: {
    title: "Entwurf: noch nicht in Kraft",
    body: "Dieser Text ist ein erster Entwurf, den die Rechtsberatung noch prüft. Er gilt noch nicht und wird sich ändern, bevor er gilt.",
  },
  description: "{title} von enaibler, der Plattform für Academies, die mit echter Arbeit enden.",
};

export const LEGAL: Record<Locale, LegalCopy> = { en, de };
