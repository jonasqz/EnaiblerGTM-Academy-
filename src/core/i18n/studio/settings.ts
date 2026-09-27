/** Studio strings: settings (see ./index.ts). Keys start with "settings.". */
export const en = {
  // Frame of the settings pages
  "settings.title": "Settings",
  "settings.description": "How {academy} presents itself to learners.",
  "settings.tab.academy": "Academy",
  "settings.tab.brand": "Brand",
  "settings.tab.domains": "Domains",
  "settings.tab.integrations": "Integrations",

  // Academy
  "settings.academy.heading": "Academy",
  "settings.academy.name": "Name",
  "settings.academy.nameHint":
    "A brand, never a person. It is the sender of e-mails and the issuer of certificates.",
  "settings.academy.address": "Address",
  "settings.academy.addressHint":
    "Your own domain (academy.your-company.com) can be connected on request.",
  "settings.academy.languages": "Languages",
  "settings.academy.defaultLanguage": "Default language",
  "settings.academy.website": "Website",
  "settings.academy.websitePlaceholder": "https://your-company.com",
  "settings.academy.websiteHint": "Brand import reads your colours and fonts from here.",
  "settings.academy.replyTo": "Replies go to",
  "settings.academy.replyToPlaceholder": "hello@your-company.com",
  "settings.academy.replyToHint":
    "Mails to learners (sign-in links, feedback, levels) come from {sender}. When a learner replies, the answer goes to this address.",
  "settings.legal.heading": "Legal pages",
  "settings.legal.intro":
    "Your academy’s own pages, linked in its footer and e-mails. Imprint and privacy page are required before the first course goes live.",
  "settings.legal.imprint": "Imprint",
  "settings.legal.privacy": "Privacy policy",
  "settings.legal.terms": "Terms (optional)",
  "settings.legal.required": "(required to publish)",
  "settings.legal.imprintPlaceholder": "https://your-company.com/imprint",
  "settings.legal.privacyPlaceholder": "https://your-company.com/privacy",
  "settings.legal.termsPlaceholder": "https://your-company.com/terms",
  "settings.cta.heading": "Button on shared certificates",
  "settings.cta.intro":
    "Everyone who opens a shared Certificate of Completion sees this button; it leads into your academy.",
  "settings.modules.heading": "Modules",
  "settings.modules.intro": "Switch parts of the academy on when you need them.",
  "settings.module.ai_review.label": "AI review",
  "settings.module.ai_review.body":
    "Hand-ins get AI feedback within minutes; your team spot-checks. Off: every hand-in waits for a person.",
  "settings.module.paths.label": "Paths",
  "settings.module.paths.body":
    "Ordered sets of courses learners choose as their direction. Off: a plain course catalogue.",
  "settings.module.levels.label": "Levels",
  "settings.module.levels.body":
    "Progress along a path earns levels, shown on certificates. Needs paths.",
  "settings.module.cohorts.label": "Cohorts",
  "settings.module.cohorts.body": "Groups that start a course together, with dates and mentors.",
  "settings.module.showcase.label": "Showcase",
  "settings.module.showcase.body":
    "Learners may show an excerpt of their work on their public certificate page.",
  "settings.academy.save": "Save settings",

  // Saving the academy settings
  "settings.academy.noLanguage": "Offer at least one language.",
  "settings.academy.saved": "Settings saved.",
  // Field names put in front of the manifest's own (English) messages
  "settings.academy.field.name": "Academy name",
  "settings.academy.field.imprint": "Legal page (imprint)",
  "settings.academy.field.privacy": "Legal page (privacy)",
  "settings.academy.field.terms": "Legal page (terms)",
  "settings.academy.field.cta": "Certificate button",

  // Saving the brand (the brand editor's own words are in ./brand.ts)
  "settings.theme.unreadable":
    "The brand settings could not be read. Reload the page and try again.",
  "settings.theme.saved": "Brand saved. Your academy looks like this now.",
  "settings.theme.reset": "Back to enaibler's default look.",
} as const;

export const de: Record<keyof typeof en, string> = {
  "settings.title": "Einstellungen",
  "settings.description": "Wie {academy} gegenüber Lernenden auftritt.",
  "settings.tab.academy": "Akademie",
  "settings.tab.brand": "Marke",
  "settings.tab.domains": "Domains",
  "settings.tab.integrations": "Integrationen",

  "settings.academy.heading": "Akademie",
  "settings.academy.name": "Name",
  "settings.academy.nameHint":
    "Eine Marke, nie eine Person. Unter diesem Namen gehen E-Mails raus und werden Abschlussbescheinigungen ausgestellt.",
  "settings.academy.address": "Adresse",
  "settings.academy.addressHint":
    "Deine eigene Domain (akademie.deine-firma.de) lässt sich auf Anfrage verbinden.",
  "settings.academy.languages": "Sprachen",
  "settings.academy.defaultLanguage": "Standardsprache",
  "settings.academy.website": "Website",
  "settings.academy.websitePlaceholder": "https://deine-firma.de",
  "settings.academy.websiteHint":
    "Der Import deiner Marke liest Farben und Schriften von dieser Website.",
  "settings.academy.replyTo": "Antworten gehen an",
  "settings.academy.replyToPlaceholder": "hallo@deine-firma.de",
  "settings.academy.replyToHint":
    "Mails an Lernende (Anmeldelinks, Feedback, Level) kommen von {sender}. Wenn Lernende antworten, geht die Antwort an diese Adresse.",
  "settings.legal.heading": "Rechtliche Seiten",
  "settings.legal.intro":
    "Die eigenen Seiten deiner Akademie, verlinkt in ihrer Fußzeile und in E-Mails. Impressum und Datenschutzerklärung sind Pflicht, bevor der erste Kurs online geht.",
  "settings.legal.imprint": "Impressum",
  "settings.legal.privacy": "Datenschutzerklärung",
  "settings.legal.terms": "Nutzungsbedingungen (optional)",
  "settings.legal.required": "(zum Veröffentlichen nötig)",
  "settings.legal.imprintPlaceholder": "https://deine-firma.de/impressum",
  "settings.legal.privacyPlaceholder": "https://deine-firma.de/datenschutz",
  "settings.legal.termsPlaceholder": "https://deine-firma.de/nutzungsbedingungen",
  "settings.cta.heading": "Button auf geteilten Abschlussbescheinigungen",
  "settings.cta.intro":
    "Alle, die eine geteilte Abschlussbescheinigung öffnen, sehen diesen Button. Er führt in deine Akademie.",
  "settings.modules.heading": "Module",
  "settings.modules.intro": "Schalte Teile der Akademie ein, wenn du sie brauchst.",
  "settings.module.ai_review.label": "KI-Bewertung",
  "settings.module.ai_review.body":
    "Abgaben bekommen in wenigen Minuten Feedback von der KI, dein Team macht Stichproben. Aus: Jede Abgabe wartet auf einen Menschen.",
  "settings.module.paths.label": "Lernpfade",
  "settings.module.paths.body":
    "Geordnete Folgen von Kursen, die Lernende als ihre Richtung wählen. Aus: ein einfacher Kurskatalog.",
  "settings.module.levels.label": "Level",
  "settings.module.levels.body":
    "Fortschritt auf einem Lernpfad bringt Level, die auf Abschlussbescheinigungen stehen. Braucht Lernpfade.",
  "settings.module.cohorts.label": "Gruppen",
  "settings.module.cohorts.body":
    "Gruppen, die einen Kurs gemeinsam beginnen, mit Terminen und Mentor:innen.",
  "settings.module.showcase.label": "Präsentation",
  "settings.module.showcase.body":
    "Lernende können auf der öffentlichen Seite ihrer Abschlussbescheinigung einen Auszug ihrer Arbeit zeigen.",
  "settings.academy.save": "Einstellungen speichern",

  "settings.academy.noLanguage": "Biete mindestens eine Sprache an.",
  "settings.academy.saved": "Einstellungen gespeichert.",
  "settings.academy.field.name": "Name der Akademie",
  "settings.academy.field.imprint": "Rechtliche Seite (Impressum)",
  "settings.academy.field.privacy": "Rechtliche Seite (Datenschutz)",
  "settings.academy.field.terms": "Rechtliche Seite (Nutzungsbedingungen)",
  "settings.academy.field.cta": "Button der Abschlussbescheinigung",

  "settings.theme.unreadable":
    "Die Markeneinstellungen konnten nicht gelesen werden. Lade die Seite neu und versuch es noch einmal.",
  "settings.theme.saved": "Marke gespeichert. So sieht deine Akademie jetzt aus.",
  "settings.theme.reset": "Zurück zum Standarddesign von enaibler.",
};
