import type { Locale } from "@/core/i18n/locales";

/* The sign-up page around the form (the form's own words: platform-messages.ts). */

const en = {
  meta: {
    title: "Create your academy · enaibler",
    description:
      "Create your academy in a minute and start in the Studio: your brand, your legal pages, your first course.",
  },
  eyebrow: "Get started",
  title: "Start your academy.",
  body: "It takes a minute. Then you are in the Studio with a short checklist: your brand, your legal pages, your first course.",
  next: {
    title: "What happens next",
    steps: [
      "We e-mail you a sign-in link. No password.",
      "The link opens your academy's Studio.",
      "Set your brand, add your legal pages, build your first course.",
    ],
  },
  points: ["Hosted in the EU", "Your brand from day one", "German and English"],
};

export type CreateCopy = typeof en;

const de: CreateCopy = {
  meta: {
    title: "Academy erstellen · enaibler",
    description:
      "Erstelle deine Academy in einer Minute und starte im Studio: deine Marke, deine Rechtstexte, dein erster Kurs.",
  },
  eyebrow: "Loslegen",
  title: "Starte deine Academy.",
  body: "Das dauert eine Minute. Danach bist du im Studio mit einer kurzen Checkliste: deine Marke, deine Rechtstexte, dein erster Kurs.",
  next: {
    title: "So geht es weiter",
    steps: [
      "Wir schicken dir einen Anmeldelink per E-Mail. Kein Passwort.",
      "Der Link öffnet das Studio deiner Academy.",
      "Marke festlegen, Rechtstexte ergänzen, ersten Kurs bauen.",
    ],
  },
  points: ["In der EU gehostet", "Deine Marke vom ersten Tag an", "Deutsch und Englisch"],
};

export const CREATE: Record<Locale, CreateCopy> = { en, de };
