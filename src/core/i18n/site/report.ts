import type { Locale } from "@/core/i18n/locales";
import type { ReportReason } from "@/core/platform/report";

/*
 * The report page (notice and action, DSA Art. 16) and the confirmation of
 * receipt its reporters get. Anyone may report, learners included, so the
 * words stay plain; they never repeat what the reporter typed.
 */

const en = {
  meta: {
    title: "Report content · enaibler",
    description:
      "Report illegal content or a breach of our terms on an academy hosted by enaibler, or on this website.",
  },
  eyebrow: "Trust and safety",
  title: "Report content",
  body: "Found something in an academy or on this website that you consider illegal, or that breaks our terms of use? Tell us here. We look at every report without undue delay and let you know what we decided.",
  support:
    "Questions about a course, a certificate or your data? Please contact the academy: its imprint and privacy policy are linked at the bottom of each of its pages.",
  byEmail: {
    title: "Reports go by e-mail for now",
    body: "Please send your report to the e-mail address in our {imprint}, with the details this form asks for.",
    imprint: "imprint",
  },
  form: {
    title: "Your report",
    url: "Address of the content",
    urlHint: "The exact address (URL) of the page, certificate or file.",
    reason: "Reason",
    reasons: {
      illegal: "Illegal content",
      csam: "Child sexual abuse material",
      terms: "Breach of enaibler's terms of use",
      other: "Something else",
    } satisfies Record<ReportReason, string>,
    explanation: "Explanation",
    explanationHint:
      "Why is it illegal or against the terms? Be as precise as you can: what exactly, where on the page, and which law or which rights it breaks.",
    name: "Your name",
    email: "Your e-mail address",
    contactHint:
      "So we can confirm receipt and tell you our decision. Only for reports of child sexual abuse material may you leave both empty.",
    goodFaith:
      "I confirm in good faith that the information and allegations in this report are accurate and complete.",
    privacy:
      "We use your details only to handle this report ({privacy}). The academy concerned learns who reported it only where that is strictly necessary.",
    privacyLink: "privacy policy",
    submit: "Send report",
    submitting: "Sending…",
  },
  errors: {
    url: "Enter the full address of the content, starting with https://.",
    reason: "Choose the reason for your report.",
    explanation: "Explain in at least 20 characters why you report it.",
    name: "Enter your name.",
    email: "Enter a valid e-mail address.",
    goodFaith: "Please confirm that your report is accurate and made in good faith.",
    rateLimited: "Too many reports from here. Please try again in an hour.",
    failed:
      "Your report could not be sent. Please try again, or send it by e-mail to the address in our imprint.",
    unavailable:
      "Reports cannot be sent through this form yet. Please send them by e-mail to the address in our imprint.",
  },
  sent: {
    title: "Thank you. We received your report.",
    body: "Your reference is {reference}. We look at your report without undue delay.",
    confirmation: "A confirmation of receipt is on its way to {email}.",
    anonymous: "You reported without an e-mail address, so we cannot tell you our decision.",
    again: "Report something else",
  },
  mail: {
    subject: "We received your report ({reference})",
    heading: "We received your report",
    body: "Thank you for your report of {date}. We look at every report without undue delay and will let you know by e-mail what we decided.",
    reference: "Your reference: {reference}. Please quote it if you write to us about this report.",
    note: "You get this e-mail because this address was given in a report on enaibler's website. If that was not you, you can ignore it.",
  },
};

export type ReportCopy = typeof en;

const de: ReportCopy = {
  meta: {
    title: "Inhalte melden · enaibler",
    description:
      "Melde rechtswidrige Inhalte oder Verstöße gegen unsere Bedingungen in einer Academy auf enaibler oder auf dieser Website.",
  },
  eyebrow: "Vertrauen und Sicherheit",
  title: "Inhalte melden",
  body: "Du hast in einer Academy oder auf dieser Website etwas gefunden, das du für rechtswidrig hältst oder das gegen unsere Nutzungsbedingungen verstößt? Sag es uns hier. Wir sehen uns jede Meldung unverzüglich an und teilen dir mit, wie wir entschieden haben.",
  support:
    "Fragen zu einem Kurs, einer Abschlussbescheinigung oder deinen Daten? Wende dich bitte an die Academy: Ihr Impressum und ihre Datenschutzerklärung findest du unten auf jeder ihrer Seiten.",
  byEmail: {
    title: "Meldungen bitte vorerst per E-Mail",
    body: "Bitte schick deine Meldung an die E-Mail-Adresse in unserem {imprint}, mit den Angaben, nach denen dieses Formular fragt.",
    imprint: "Impressum",
  },
  form: {
    title: "Deine Meldung",
    url: "Adresse des Inhalts",
    urlHint: "Die genaue Adresse (URL) der Seite, Abschlussbescheinigung oder Datei.",
    reason: "Grund",
    reasons: {
      illegal: "Rechtswidriger Inhalt",
      csam: "Darstellung sexuellen Missbrauchs von Kindern",
      terms: "Verstoß gegen die Nutzungsbedingungen von enaibler",
      other: "Etwas anderes",
    },
    explanation: "Begründung",
    explanationHint:
      "Warum ist der Inhalt rechtswidrig oder verstößt gegen die Bedingungen? Sei so genau wie möglich: was genau, wo auf der Seite und gegen welches Gesetz oder welche Rechte.",
    name: "Dein Name",
    email: "Deine E-Mail-Adresse",
    contactHint:
      "Damit wir dir den Eingang bestätigen und unsere Entscheidung mitteilen können. Nur bei Meldungen von Darstellungen sexuellen Missbrauchs von Kindern darfst du beides leer lassen.",
    goodFaith:
      "Ich bestätige in gutem Glauben, dass die Angaben und Vorwürfe in dieser Meldung richtig und vollständig sind.",
    privacy:
      "Wir verwenden deine Angaben nur, um diese Meldung zu bearbeiten ({privacy}). Die betroffene Academy erfährt nur dann, wer gemeldet hat, wenn das unbedingt erforderlich ist.",
    privacyLink: "Datenschutzerklärung",
    submit: "Meldung senden",
    submitting: "Wird gesendet …",
  },
  errors: {
    url: "Gib die vollständige Adresse des Inhalts ein, beginnend mit https://.",
    reason: "Wähle den Grund für deine Meldung.",
    explanation: "Erkläre in mindestens 20 Zeichen, warum du den Inhalt meldest.",
    name: "Gib deinen Namen ein.",
    email: "Gib eine gültige E-Mail-Adresse ein.",
    goodFaith: "Bitte bestätige, dass deine Meldung zutrifft und in gutem Glauben erfolgt.",
    rateLimited: "Zu viele Meldungen von hier. Bitte versuch es in einer Stunde noch einmal.",
    failed:
      "Deine Meldung konnte nicht gesendet werden. Bitte versuch es noch einmal oder schick sie per E-Mail an die Adresse in unserem Impressum.",
    unavailable:
      "Über dieses Formular können noch keine Meldungen gesendet werden. Bitte schick sie per E-Mail an die Adresse in unserem Impressum.",
  },
  sent: {
    title: "Danke. Wir haben deine Meldung erhalten.",
    body: "Deine Referenz lautet {reference}. Wir sehen uns deine Meldung unverzüglich an.",
    confirmation: "Eine Eingangsbestätigung ist an {email} unterwegs.",
    anonymous:
      "Du hast ohne E-Mail-Adresse gemeldet, deshalb können wir dir unsere Entscheidung nicht mitteilen.",
    again: "Etwas anderes melden",
  },
  mail: {
    subject: "Wir haben deine Meldung erhalten ({reference})",
    heading: "Wir haben deine Meldung erhalten",
    body: "Danke für deine Meldung vom {date}. Wir sehen uns jede Meldung unverzüglich an und teilen dir per E-Mail mit, wie wir entschieden haben.",
    reference:
      "Deine Referenz: {reference}. Gib sie bitte an, wenn du uns zu dieser Meldung schreibst.",
    note: "Du bekommst diese E-Mail, weil diese Adresse in einer Meldung auf der Website von enaibler angegeben wurde. Warst du das nicht, kannst du sie ignorieren.",
  },
};

export const REPORT: Record<Locale, ReportCopy> = { en, de };
