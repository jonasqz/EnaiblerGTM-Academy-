import type { Locale } from "@/core/i18n/locales";

/*
 * enaibler's own website (the platform host): navigation, footer and the
 * lines every page shares. enaibler talking, never tenant-overridable; the
 * wording rules apply (site.test.ts lints every string).
 */

const en = {
  nav: {
    label: "Main",
    how: "How it works",
    consultancies: "Consultancies",
    software: "Software companies",
    create: "Create your academy",
    menu: "Menu",
    language: "Language",
  },
  footer: {
    tagline: "Academies that end in real work, and bring you the next learner.",
    product: "Product",
    madeFor: "Made for",
    legal: "Legal",
    imprint: "Imprint",
    privacy: "Privacy",
    terms: "Terms",
    dpa: "Data processing agreement",
    hosted: "Hosted in the EU",
  },
  cta: {
    create: "Create your academy",
    how: "See how it works",
    demo: "Visit a demo academy",
  },
  close: {
    title: "Your expertise is already your best pitch.",
    body: "Let people experience it, and let their work bring you the next ones.",
  },
  shots: "Screens from a demo academy with sample data.",
  opens: "opens in a new tab",
  faq: "Questions",
  example: "Example",
};

export type SiteCommonCopy = typeof en;

const de: SiteCommonCopy = {
  nav: {
    label: "Hauptmenü",
    how: "So funktioniert's",
    consultancies: "Beratungen",
    software: "Softwareunternehmen",
    create: "Academy erstellen",
    menu: "Menü",
    language: "Sprache",
  },
  footer: {
    tagline: "Academies, die mit echter Arbeit enden und dir die Nächsten bringen.",
    product: "Produkt",
    madeFor: "Gemacht für",
    legal: "Rechtliches",
    imprint: "Impressum",
    privacy: "Datenschutz",
    terms: "Nutzungsbedingungen",
    dpa: "Auftragsverarbeitung (AVV)",
    hosted: "In der EU gehostet",
  },
  cta: {
    create: "Academy erstellen",
    how: "So funktioniert's",
    demo: "Demo-Academy ansehen",
  },
  close: {
    title: "Dein Wissen ist schon dein bestes Verkaufsargument.",
    body: "Lass Menschen es erleben, und lass ihre Arbeit dir die Nächsten bringen.",
  },
  shots: "Screens aus einer Demo-Academy mit Beispieldaten.",
  opens: "öffnet in einem neuen Tab",
  faq: "Fragen",
  example: "Beispiel",
};

export const SITE_COMMON: Record<Locale, SiteCommonCopy> = { en, de };
