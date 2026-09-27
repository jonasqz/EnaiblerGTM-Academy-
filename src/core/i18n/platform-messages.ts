import type { Locale } from "@/core/i18n/locales";

/**
 * The sign-up form on the platform site, where customers create their
 * academy (the website's pages: core/i18n/site). Not tenant-overridable
 * (unlike messages.ts): this is enaibler talking. The wording rules apply
 * here too (see compliance/wording-lint.ts).
 */
const en = {
  "form.title": "Create your academy",
  "form.name": "Academy name",
  "form.nameHint": "The brand learners see, e.g. “Acme Sales Academy”. Not a person's name.",
  "form.slug": "Address",
  "form.slugHint": "Lowercase letters, digits and dashes. You can connect your own domain later.",
  "form.email": "Your work e-mail",
  "form.emailHint": "We send you a sign-in link. No password.",
  "form.language": "Main language",
  "form.alsoOffer": "Also offer {language}",
  "form.website": "Your website (optional)",
  "form.websiteHint": "In the Studio we can take your colours and fonts from it.",
  "form.accept": "I accept the {terms} and the {dpa}.",
  "form.termsLink": "terms of use",
  "form.dpaLink": "data processing agreement",
  "form.submit": "Create academy",
  "form.submitting": "Creating…",

  "sent.title": "Check your inbox",
  "sent.body": "We sent a sign-in link to {email}. It opens the Studio of your academy at {url}.",
  "sent.next": "Next: your brand, your legal pages, your first course.",

  "error.slugTaken": "This address is taken. Try another one.",
  "error.slugReserved": "This address is reserved. Try another one.",
  "error.slugInvalid": "Use 3 to 40 lowercase letters, digits and dashes.",
  "error.name":
    "Use your academy's name (2 to 80 characters), without words that promise a formal qualification.",
  "error.email": "Enter a valid e-mail address.",
  "error.website": "Enter your website's address, e.g. acme.com.",
  "error.accept": "Please accept the terms of use and the data processing agreement.",
  "error.rateLimited": "Too many attempts. Please try again in an hour.",
  "error.generic": "That did not work. Please try again.",
  unavailable: "Creating academies is not available here yet.",
} as const;

export type PlatformMessageKey = keyof typeof en;

const de: Record<PlatformMessageKey, string> = {
  "form.title": "Erstelle deine Academy",
  "form.name": "Name der Academy",
  "form.nameHint": "Die Marke, die Lernende sehen, z. B. „Acme Sales Academy“. Kein Personenname.",
  "form.slug": "Adresse",
  "form.slugHint":
    "Kleinbuchstaben, Ziffern und Bindestriche. Eine eigene Domain kannst du später verbinden.",
  "form.email": "Deine berufliche E-Mail-Adresse",
  "form.emailHint": "Wir schicken dir einen Anmeldelink. Kein Passwort.",
  "form.language": "Hauptsprache",
  "form.alsoOffer": "Zusätzlich auf {language} anbieten",
  "form.website": "Deine Website (optional)",
  "form.websiteHint": "Im Studio können wir daraus deine Farben und Schriften übernehmen.",
  "form.accept": "Ich akzeptiere die {terms} und den {dpa}.",
  "form.termsLink": "Nutzungsbedingungen",
  "form.dpaLink": "Auftragsverarbeitungsvertrag (AVV)",
  "form.submit": "Academy erstellen",
  "form.submitting": "Wird erstellt …",

  "sent.title": "Schau in dein Postfach",
  "sent.body":
    "Wir haben einen Anmeldelink an {email} geschickt. Er öffnet das Studio deiner Academy unter {url}.",
  "sent.next": "Als Nächstes: deine Marke, deine Rechtstexte, dein erster Kurs.",

  "error.slugTaken": "Diese Adresse ist vergeben. Probier eine andere.",
  "error.slugReserved": "Diese Adresse ist reserviert. Probier eine andere.",
  "error.slugInvalid": "Verwende 3 bis 40 Kleinbuchstaben, Ziffern und Bindestriche.",
  "error.name":
    "Verwende den Namen deiner Academy (2 bis 80 Zeichen), ohne Begriffe, die eine formale Qualifikation versprechen.",
  "error.email": "Gib eine gültige E-Mail-Adresse ein.",
  "error.website": "Gib die Adresse deiner Website ein, z. B. acme.com.",
  "error.accept": "Bitte akzeptiere die Nutzungsbedingungen und den AVV.",
  "error.rateLimited": "Zu viele Versuche. Bitte versuch es in einer Stunde noch einmal.",
  "error.generic": "Das hat nicht geklappt. Bitte versuch es noch einmal.",
  unavailable: "Academies können hier noch nicht erstellt werden.",
};

const MESSAGES: Record<Locale, Record<PlatformMessageKey, string>> = { en, de };

export type PlatformText = (
  key: PlatformMessageKey,
  vars?: Record<string, string | number>,
) => string;

export function platformText(locale: Locale): PlatformText {
  return (key, vars = {}) =>
    MESSAGES[locale][key].replace(/\{(\w+)\}/g, (match, name: string) =>
      name in vars ? String(vars[name]) : match,
    );
}
