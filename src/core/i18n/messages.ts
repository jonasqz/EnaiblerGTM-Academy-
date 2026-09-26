import type { Locale } from "@/core/i18n/locales";

/**
 * Learner-facing UI strings. Placeholders:
 *   {name}         variable passed to t()
 *   {term.path}    tenant term, singular (see core/terminology)
 *   {terms.path}   tenant term, plural
 * German copy uses "du"; tenants can override any key via `terminology.strings`.
 */
const en = {
  "app.poweredBy": "Powered by enaibler",
  "nav.signIn": "Sign in",
  "nav.signOut": "Sign out",
  "nav.profile": "Profile",
  "nav.language": "Language",
  "footer.imprint": "Imprint",
  "footer.privacy": "Privacy",
  "footer.terms": "Terms",

  "home.choosePath": "Choose your {term.path}",
  "home.courses": "{terms.course}",
  "home.coursesInPath": "{terms.course} in this {term.path}",
  "home.empty": "No {terms.course} published yet.",
  "home.minutes": "{minutes} min",
  "home.start": "Start",

  "signIn.title": "Sign in to {academy}",
  "signIn.intro": "We'll email you a sign-in link. No password needed.",
  "signIn.emailLabel": "Email address",
  "signIn.submit": "Email me a sign-in link",
  "signIn.sending": "Sending…",
  "signIn.sent": "Check your inbox: we sent a sign-in link to {email}.",
  "signIn.error": "Something went wrong. Please try again.",
  "signIn.linkExpired":
    "That sign-in link has expired or was already used. Request a new one below.",

  "verify.awardedTo": "Awarded to",
  "verify.issuedBy": "Issued by {academy}",
  "verify.issuedOn": "Issued on",
  "verify.credentialId": "Credential ID",
  "verify.verificationUrl": "Verification URL",
  "verify.level": "{term.level} {n} · {name}",
  "verify.artifact": "{term.artifact}: {name}",
  "verify.backedByWork": "Earned with real work that passed a rubric-based review.",
  "verify.unavailable": "This credential is no longer available",
  "verify.addToProfile": "Add to LinkedIn profile",
  "verify.share": "Share on LinkedIn",
  "verify.downloadCard": "Download card",
  "verify.privateNotice": "Only you can see this page. Make it public to share it.",
  "verify.publicNotice": "This page is public. Anyone with the link can see it.",
  "verify.makePublic": "Make public",
  "verify.makePrivate": "Make private",

  "error.notFound": "Page not found",

  "email.magicLink.subject": "Your sign-in link for {academy}",
  "email.magicLink.heading": "Sign in to {academy}",
  "email.magicLink.body":
    "Use the button below to sign in. The link expires in {minutes} minutes and works once.",
  "email.magicLink.button": "Sign in",
  "email.magicLink.ignore": "If you didn't request this email, you can safely ignore it.",
} as const;

export type MessageKey = keyof typeof en;
export const MESSAGE_KEYS = Object.keys(en) as [MessageKey, ...MessageKey[]];

const de: Record<MessageKey, string> = {
  "app.poweredBy": "Powered by enaibler",
  "nav.signIn": "Anmelden",
  "nav.signOut": "Abmelden",
  "nav.profile": "Profil",
  "nav.language": "Sprache",
  "footer.imprint": "Impressum",
  "footer.privacy": "Datenschutz",
  "footer.terms": "Nutzungsbedingungen",

  "home.choosePath": "{term.path} wählen",
  "home.courses": "{terms.course}",
  "home.coursesInPath": "{terms.course} in diesem {term.path}",
  "home.empty": "Noch keine {terms.course} veröffentlicht.",
  "home.minutes": "{minutes} Min.",
  "home.start": "Starten",

  "signIn.title": "Bei {academy} anmelden",
  "signIn.intro": "Wir schicken dir einen Anmeldelink per E-Mail. Kein Passwort nötig.",
  "signIn.emailLabel": "E-Mail-Adresse",
  "signIn.submit": "Anmeldelink senden",
  "signIn.sending": "Wird gesendet…",
  "signIn.sent": "Schau in dein Postfach: Wir haben einen Anmeldelink an {email} geschickt.",
  "signIn.error": "Etwas ist schiefgelaufen. Bitte versuche es noch einmal.",
  "signIn.linkExpired":
    "Dieser Anmeldelink ist abgelaufen oder wurde schon benutzt. Fordere unten einen neuen an.",

  "verify.awardedTo": "Ausgestellt für",
  "verify.issuedBy": "Ausgestellt von {academy}",
  "verify.issuedOn": "Ausgestellt am",
  "verify.credentialId": "Nachweis-ID",
  "verify.verificationUrl": "Prüf-URL",
  "verify.level": "{term.level} {n} · {name}",
  "verify.artifact": "{term.artifact}: {name}",
  "verify.backedByWork":
    "Erworben mit einer echten Arbeit, die eine Bewertung anhand klarer Kriterien bestanden hat.",
  "verify.unavailable": "Dieser Nachweis ist nicht mehr verfügbar",
  "verify.addToProfile": "Zum LinkedIn-Profil hinzufügen",
  "verify.share": "Auf LinkedIn teilen",
  "verify.downloadCard": "Karte herunterladen",
  "verify.privateNotice": "Nur du siehst diese Seite. Mach sie öffentlich, um sie zu teilen.",
  "verify.publicNotice": "Diese Seite ist öffentlich. Alle mit dem Link können sie sehen.",
  "verify.makePublic": "Öffentlich machen",
  "verify.makePrivate": "Privat machen",

  "error.notFound": "Seite nicht gefunden",

  "email.magicLink.subject": "Dein Anmeldelink für {academy}",
  "email.magicLink.heading": "Bei {academy} anmelden",
  "email.magicLink.body":
    "Melde dich über den Button unten an. Der Link ist {minutes} Minuten gültig und funktioniert einmal.",
  "email.magicLink.button": "Anmelden",
  "email.magicLink.ignore":
    "Wenn du diese E-Mail nicht angefordert hast, kannst du sie ignorieren.",
};

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { en, de };
