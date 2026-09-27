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

  // Domains
  "settings.domains.addresses": "Addresses",
  "settings.domains.addressesIntro":
    "Links in mails and on certificates use the main address; the others redirect to it.",
  "settings.domains.main": "Main address",
  "settings.domains.makeMain": "Make main address",
  "settings.domains.switching": "Switching…",
  "settings.domains.makeMainConfirm":
    "Make {domain} the main address? You will sign in again there; learners do too, once.",
  "settings.domains.removeConfirm": "Remove {domain}? Links to it stop working.",
  "settings.domains.settingUp": "Setting up {domain}",
  "settings.domains.waiting": "Waiting for DNS",
  "settings.domains.notVerified": "Not verified",
  "settings.domains.instructions":
    "Add these two records where your domain’s DNS is managed. We check every ten minutes; the domain goes live, with its certificate, once both are found.",
  "settings.domains.recordsCaption": "DNS records for {domain}",
  "settings.domains.type": "Type",
  "settings.domains.name": "Name",
  "settings.domains.value": "Value",
  // {types}: "A" or "A/AAAA"
  "settings.domains.apexAddresses":
    "A domain without a subdomain (like your-company.com) cannot have a CNAME: use {types} records to {addresses} instead.",
  "settings.domains.apexTarget":
    "A domain without a subdomain (like your-company.com) cannot have a CNAME: use {types} records with the addresses of {target} instead.",
  "settings.domains.taken": "Another academy verified this domain first.",
  "settings.domains.expired":
    "DNS was not set up within {days} days. Remove it and add it again to get a new record.",
  // {missing}: a list of the settings.domains.missing.* texts
  "settings.domains.checked": "Checked {when}: {missing}.",
  "settings.domains.missing.txt": "the TXT record is not there yet",
  "settings.domains.missing.routing": "the domain does not point to your academy yet",
  "settings.domains.checkNow": "Check now",
  "settings.domains.checking": "Checking DNS…",
  "settings.domains.unavailable": "Own domains are not set up on this server yet",
  "settings.domains.unavailableBody":
    "The operator sets CUSTOM_DOMAIN_TARGET or ACADEMY_DOMAIN to enable them.",

  // Adding a domain
  "settings.domains.add.heading": "Use your own domain",
  "settings.domains.add.intro":
    "For example academy.your-company.com. Your academy stays reachable at its current address.",
  "settings.domains.add.label": "Domain",
  "settings.domains.add.placeholder": "academy.your-company.com",
  "settings.domains.add.submit": "Add domain",
  "settings.domains.add.done":
    "Added. Set the two DNS records below; we check every ten minutes for {days} days.",
  "settings.domains.error.invalid": "Enter a domain such as academy.your-company.com.",
  "settings.domains.error.reserved": "This address belongs to enaibler or is not a public domain.",
  "settings.domains.error.ip": "Enter a domain name, not an IP address.",
  "settings.domains.error.taken": "This domain is already in use by an academy.",
  "settings.domains.error.limit": "An academy can have up to {max} own domains. Remove one first.",
  "settings.domains.error.unavailable": "Own domains are not set up on this server yet.",
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

  "settings.domains.addresses": "Adressen",
  "settings.domains.addressesIntro":
    "Links in Mails und auf Abschlussbescheinigungen nutzen die Hauptadresse, die anderen leiten dorthin weiter.",
  "settings.domains.main": "Hauptadresse",
  "settings.domains.makeMain": "Zur Hauptadresse machen",
  "settings.domains.switching": "Wird umgestellt…",
  "settings.domains.makeMainConfirm":
    "{domain} zur Hauptadresse machen? Du meldest dich dort neu an, Lernende einmalig auch.",
  "settings.domains.removeConfirm":
    "{domain} entfernen? Links dorthin funktionieren dann nicht mehr.",
  "settings.domains.settingUp": "{domain} einrichten",
  "settings.domains.waiting": "Wartet auf DNS",
  "settings.domains.notVerified": "Nicht bestätigt",
  "settings.domains.instructions":
    "Trag diese beiden Einträge dort ein, wo das DNS deiner Domain verwaltet wird. Wir prüfen alle zehn Minuten. Sobald beide gefunden sind, geht die Domain online, direkt mit HTTPS.",
  "settings.domains.recordsCaption": "DNS-Einträge für {domain}",
  "settings.domains.type": "Typ",
  "settings.domains.name": "Name",
  "settings.domains.value": "Wert",
  "settings.domains.apexAddresses":
    "Eine Domain ohne Subdomain (wie deine-firma.de) kann keinen CNAME haben: Nutze stattdessen {types}-Einträge auf {addresses}.",
  "settings.domains.apexTarget":
    "Eine Domain ohne Subdomain (wie deine-firma.de) kann keinen CNAME haben: Nutze stattdessen {types}-Einträge mit den Adressen von {target}.",
  "settings.domains.taken": "Eine andere Akademie hat diese Domain zuerst bestätigt.",
  "settings.domains.expired":
    "Das DNS wurde nicht innerhalb von {days} Tagen eingerichtet. Entferne die Domain und füge sie neu hinzu, um einen neuen Eintrag zu bekommen.",
  "settings.domains.checked": "Zuletzt geprüft am {when}. Noch nicht gefunden: {missing}.",
  "settings.domains.missing.txt": "der TXT-Eintrag",
  "settings.domains.missing.routing": "der Verweis der Domain auf deine Akademie",
  "settings.domains.checkNow": "Jetzt prüfen",
  "settings.domains.checking": "DNS wird geprüft…",
  "settings.domains.unavailable": "Eigene Domains sind auf diesem Server noch nicht eingerichtet",
  "settings.domains.unavailableBody":
    "Wer den Server betreibt, schaltet sie mit CUSTOM_DOMAIN_TARGET oder ACADEMY_DOMAIN frei.",

  "settings.domains.add.heading": "Eigene Domain verwenden",
  "settings.domains.add.intro":
    "Zum Beispiel akademie.deine-firma.de. Deine Akademie bleibt unter ihrer bisherigen Adresse erreichbar.",
  "settings.domains.add.label": "Domain",
  "settings.domains.add.placeholder": "akademie.deine-firma.de",
  "settings.domains.add.submit": "Domain hinzufügen",
  "settings.domains.add.done":
    "Hinzugefügt. Trag die beiden DNS-Einträge unten ein. Wir prüfen {days} Tage lang alle zehn Minuten.",
  "settings.domains.error.invalid": "Gib eine Domain wie akademie.deine-firma.de ein.",
  "settings.domains.error.reserved":
    "Diese Adresse gehört zu enaibler oder ist keine öffentliche Domain.",
  "settings.domains.error.ip": "Gib einen Domainnamen ein, keine IP-Adresse.",
  "settings.domains.error.taken": "Diese Domain nutzt bereits eine Akademie.",
  "settings.domains.error.limit":
    "Eine Akademie kann bis zu {max} eigene Domains haben. Entferne zuerst eine.",
  "settings.domains.error.unavailable":
    "Eigene Domains sind auf diesem Server noch nicht eingerichtet.",
};
