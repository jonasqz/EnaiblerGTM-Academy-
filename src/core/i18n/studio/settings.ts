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

  // Integrations: importing certificates
  "settings.import.heading": "Import certificates from another platform",
  "settings.import.intro":
    "Learners keep what they earned before: each certificate keeps its date, stays private unless it was public before, and shows where it was issued. Running the same file again changes nothing. Courses must exist here first (same slug).",
  "settings.import.format": "File format and API",
  // {path}, {level}, {publicId}: field names, shown as code
  "settings.import.formatBody":
    "A JSON file like this (up to 1,000 per file). Optional: {path}, {level}, and {publicId} to keep links that were already shared working.",
  "settings.import.api": "The same body can be sent by a script with an API key:",
  "settings.import.fileLabel": "JSON file",
  "settings.import.importing": "Importing…",
  "settings.import.submit": "Import",
  "settings.import.summary": "{imported} imported · {exists} already here · {failed} not imported",
  "settings.import.reason.unknown_course": "no course with this slug",
  "settings.import.reason.unknown_path": "no path with this slug",
  "settings.import.reason.wording": "the artifact name uses wording that is not allowed",
  "settings.import.reason.course_done": "the learner already has a certificate for this course",
  "settings.import.reason.public_id_taken": "the credential id is taken",
  "settings.import.chooseFile": "Choose a JSON file.",
  "settings.import.invalidJson": "The file is not valid JSON.",
  // Where in the file a problem is, when it is not in one field
  "settings.import.file": "file",

  // API keys
  "settings.keys.heading": "API keys",
  "settings.keys.intro":
    "For your own tools. A key works only for this academy and only for importing certificates.",
  "settings.keys.created": "created {date}",
  "settings.keys.lastUsed": "last used {date}",
  "settings.keys.notUsed": "not used yet",
  "settings.keys.revoke": "Revoke",
  "settings.keys.revokeConfirm": 'Revoke "{name}"? Tools using it stop working.',
  "settings.keys.nameLabel": "Key name",
  "settings.keys.namePlaceholder": "e.g. Migration from our old platform",
  "settings.keys.create": "Create key",
  "settings.keys.creating": "Creating…",
  "settings.keys.copyNow": "Copy the key now: it is shown only once.",
  "settings.keys.nameRequired": "Give the key a name, e.g. the tool that uses it.",

  // Embedding the path picker
  "settings.embed.heading": "Embed on your website",
  "settings.embed.showPaths": "Show your paths on your own website.",
  "settings.embed.showCourses": "Show your courses on your own website.",
  "settings.embed.intro":
    "Visitors pick one and continue in the academy in a new tab. The language and utm_* values come along, so the dashboard shows where sign-ups come from. Nothing is stored in the visitor's browser.",
  "settings.embed.showHeading": "Show heading",
  "settings.embed.code": "Embed code",
  "settings.embed.copyCode": "Copy code",
  "settings.embed.noScript": "Without JavaScript",
  "settings.embed.noScriptBody":
    "Where your website does not allow scripts, an iframe works too. It does not adjust its height, so set one that fits.",
  "settings.embed.copyIframe": "Copy iframe",
  "settings.embed.preview": "Preview",
  "settings.embed.previewTitle": "Preview: {title}",

  // Webhooks
  "settings.webhooks.heading": "Webhooks",
  "settings.webhooks.intro":
    "Tell your own tools (a CRM, a newsletter tool, n8n or Zapier) what happens in the academy, within a minute. Learners appear under a stable pseudonymous id. Their e-mail address and name are only included once they agreed to be contacted, and in consent events.",
  "settings.webhooks.label": "Webhook to {url}",
  "settings.webhooks.active": "Active",
  "settings.webhooks.paused": "Paused",
  "settings.webhooks.deliveries": "Latest deliveries",
  "settings.webhooks.column.event": "Event",
  "settings.webhooks.column.time": "Time",
  "settings.webhooks.column.result": "Result",
  "settings.webhooks.queued": "Queued",
  "settings.webhooks.retry": "{result}, retry {attempt} of {max} at {time}",
  "settings.webhooks.sendAgain": "Send again",
  "settings.webhooks.pause": "Pause",
  "settings.webhooks.resume": "Resume",
  "settings.webhooks.deleteConfirm":
    "Delete the webhook to {url}? Deliveries still waiting are dropped.",
  "settings.webhooks.docs": "What arrives and how to check it",
  // {post}, {event}, {delivery}: shown as code
  "settings.webhooks.docsBody":
    "A {post} with a JSON body like this. {event} names the event and {delivery} is unique per delivery: the same event can arrive twice, so skip ids you have seen.",
  // {signature}, {format}, {signed}: shown as code
  "settings.webhooks.docsSignature":
    "{signature} is {format}: an HMAC-SHA256 of {signed} with the webhook's signing secret. For example in Node.js:",
  "settings.webhooks.docsRetries":
    "Answer with a 2xx status within 10 seconds. Otherwise we try again after 1 and 5 minutes, half an hour, then 2, 6, 12 and 24 hours. Delivery logs are kept for 30 days.",
  "settings.webhooks.copySecret": "Copy the signing secret now: it is shown only once.",
  "settings.webhooks.full":
    "This academy has as many webhooks as it can have. Delete one to add another.",
  "settings.webhooks.add": "Add a webhook",
  "settings.webhooks.url": "Endpoint address",
  "settings.webhooks.events": "Events",
  "settings.webhooks.submit": "Add webhook",
  "settings.webhooks.test": "Send test event",
  "settings.webhooks.sending": "Sending…",
  "settings.webhooks.invalidUrl":
    "Enter the full address of your endpoint, e.g. https://hooks.example.com/academy.",
  "settings.webhooks.httpsOnly": "Use an https address: deliveries carry learner data.",
  "settings.webhooks.noEvents": "Choose at least one event.",
  "settings.webhooks.limit": "An academy can have up to {max} webhooks.",
  "settings.webhooks.group.learning": "Learning",
  "settings.webhooks.group.credentials": "Certificates",
  "settings.webhooks.group.consent": "Consent",
  "settings.webhooks.event.signup_completed": "Signed up",
  "settings.webhooks.event.course_started": "Started a course",
  "settings.webhooks.event.lesson_completed": "Completed a lesson",
  "settings.webhooks.event.assignment_submitted": "Handed in an assignment",
  "settings.webhooks.event.test_submitted": "Took the final test",
  "settings.webhooks.event.test_passed": "Passed the final test",
  "settings.webhooks.event.review_completed": "Review finished",
  "settings.webhooks.event.review_passed": "Passed an assignment",
  "settings.webhooks.event.review_overridden": "Result changed by a reviewer",
  "settings.webhooks.event.course_completed": "Completed a course",
  "settings.webhooks.event.level_up": "Reached a level",
  "settings.webhooks.event.credential_made_public": "Made a certificate public",
  "settings.webhooks.event.credential_shared_linkedin": "Shared a certificate on LinkedIn",
  "settings.webhooks.event.verification_cta_clicked":
    "Visitor clicked the call to action on a certificate",
  "settings.webhooks.event.marketing_consent_confirmed": "Confirmed the newsletter",
  "settings.webhooks.event.marketing_consent_withdrawn": "Unsubscribed from the newsletter",
  "settings.webhooks.event.contact_consent_given": "Agreed to be contacted",
  "settings.webhooks.event.contact_consent_withdrawn": "Withdrew consent to be contacted",
  "settings.webhooks.event.ping": "Test event",
  // What the receiving side answered ({code}: an HTTP status)
  "settings.webhooks.result.waiting": "Waiting",
  "settings.webhooks.result.blocked": "Blocked: the address is not public",
  "settings.webhooks.result.unreachable": "Could not connect",
  "settings.webhooks.result.paused": "Not sent: the webhook was paused",
  "settings.webhooks.result.delivered": "Delivered ({code})",
  "settings.webhooks.result.answered": "Answered {code}",

  // Warnings after saving (core/tenant/manifest.ts, by code)
  "settings.warning.paths_unused": "The Paths module is on, but there are no paths yet.",
  "settings.warning.paths_off": "There are paths, but the Paths module is off.",
  "settings.warning.levels_unused": "The Levels module is on, but there are no levels yet.",
  "settings.warning.levels_off": "There are levels, but the Levels module is off.",
  "settings.warning.no_sender":
    "No sender address of your own yet: mail goes out from the platform address.",
  "settings.warning.legal_placeholders":
    "Your legal links look like placeholders (shared or pointing at a home page): set the exact pages before going live.",
  "settings.warning.legal_missing":
    "No imprint or privacy page yet: courses cannot be published until both are set.",
  "settings.warning.font_unavailable":
    "The font “{family}” is neither bundled nor uploaded: browsers will fall back to another one.",
  "settings.warning.course_not_publishable":
    "Course “{course}”: {reason} It can be set up but not published.",
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

  "settings.import.heading": "Abschlussbescheinigungen von einer anderen Plattform importieren",
  "settings.import.intro":
    "Lernende behalten, was sie vorher erreicht haben: Jede Abschlussbescheinigung behält ihr Datum, bleibt privat, wenn sie nicht schon öffentlich war, und zeigt, wo sie ausgestellt wurde. Importierst du dieselbe Datei noch einmal, ändert sich nichts. Die Kurse müssen hier schon angelegt sein (gleiche Adresse).",
  "settings.import.format": "Dateiformat und API",
  "settings.import.formatBody":
    "Eine JSON-Datei wie diese (bis zu 1.000 pro Datei). Optional: {path}, {level} und {publicId}, damit schon geteilte Links weiter funktionieren.",
  "settings.import.api": "Denselben Inhalt kann auch ein Skript mit einem API-Schlüssel senden:",
  "settings.import.fileLabel": "JSON-Datei",
  "settings.import.importing": "Wird importiert…",
  "settings.import.submit": "Importieren",
  "settings.import.summary":
    "{imported} importiert · {exists} schon vorhanden · {failed} nicht importiert",
  "settings.import.reason.unknown_course": "kein Kurs mit dieser Adresse",
  "settings.import.reason.unknown_path": "kein Lernpfad mit dieser Adresse",
  "settings.import.reason.wording":
    "die Bezeichnung des Arbeitsergebnisses enthält eine nicht erlaubte Formulierung",
  "settings.import.reason.course_done":
    "die lernende Person hat für diesen Kurs schon eine Abschlussbescheinigung",
  "settings.import.reason.public_id_taken": "die ID der Abschlussbescheinigung ist schon vergeben",
  "settings.import.chooseFile": "Wähle eine JSON-Datei.",
  "settings.import.invalidJson": "Die Datei ist kein gültiges JSON.",
  "settings.import.file": "Datei",

  "settings.keys.heading": "API-Schlüssel",
  "settings.keys.intro":
    "Für deine eigenen Tools. Ein Schlüssel gilt nur für diese Akademie und nur für den Import von Abschlussbescheinigungen.",
  "settings.keys.created": "erstellt am {date}",
  "settings.keys.lastUsed": "zuletzt genutzt am {date}",
  "settings.keys.notUsed": "noch nicht genutzt",
  "settings.keys.revoke": "Widerrufen",
  "settings.keys.revokeConfirm":
    "„{name}“ widerrufen? Tools, die ihn nutzen, funktionieren dann nicht mehr.",
  "settings.keys.nameLabel": "Name des Schlüssels",
  "settings.keys.namePlaceholder": "z. B. Umzug von unserer alten Plattform",
  "settings.keys.create": "Schlüssel erstellen",
  "settings.keys.creating": "Wird erstellt…",
  "settings.keys.copyNow": "Kopier den Schlüssel jetzt: Er wird nur einmal angezeigt.",
  "settings.keys.nameRequired": "Gib dem Schlüssel einen Namen, z. B. das Tool, das ihn nutzt.",

  "settings.embed.heading": "Auf deiner Website einbetten",
  "settings.embed.showPaths": "Zeig deine Lernpfade auf deiner eigenen Website.",
  "settings.embed.showCourses": "Zeig deine Kurse auf deiner eigenen Website.",
  "settings.embed.intro":
    "Besucher:innen wählen einen aus und machen in einem neuen Tab in der Akademie weiter. Die Sprache und die utm_*-Werte kommen mit, damit die Übersicht zeigt, woher Anmeldungen kommen. Im Browser der Besucher:innen wird nichts gespeichert.",
  "settings.embed.showHeading": "Überschrift zeigen",
  "settings.embed.code": "Einbettungscode",
  "settings.embed.copyCode": "Code kopieren",
  "settings.embed.noScript": "Ohne JavaScript",
  "settings.embed.noScriptBody":
    "Wo deine Website keine Skripte erlaubt, funktioniert auch ein iframe. Seine Höhe passt sich nicht an, also leg eine passende fest.",
  "settings.embed.copyIframe": "iframe kopieren",
  "settings.embed.preview": "Vorschau",
  "settings.embed.previewTitle": "Vorschau: {title}",

  "settings.webhooks.heading": "Webhooks",
  "settings.webhooks.intro":
    "Sag deinen eigenen Tools (einem CRM, einem Newsletter-Tool, n8n oder Zapier) innerhalb einer Minute, was in der Akademie passiert. Lernende erscheinen unter einer festen, pseudonymen ID. Ihre E-Mail-Adresse und ihr Name kommen nur mit, wenn sie einer Kontaktaufnahme zugestimmt haben, und bei Ereignissen zur Einwilligung.",
  "settings.webhooks.label": "Webhook an {url}",
  "settings.webhooks.active": "Aktiv",
  "settings.webhooks.paused": "Pausiert",
  "settings.webhooks.deliveries": "Letzte Zustellungen",
  "settings.webhooks.column.event": "Ereignis",
  "settings.webhooks.column.time": "Zeit",
  "settings.webhooks.column.result": "Ergebnis",
  "settings.webhooks.queued": "In der Warteschlange",
  "settings.webhooks.retry": "{result}, Versuch {attempt} von {max} am {time}",
  "settings.webhooks.sendAgain": "Erneut senden",
  "settings.webhooks.pause": "Pausieren",
  "settings.webhooks.resume": "Fortsetzen",
  "settings.webhooks.deleteConfirm":
    "Den Webhook an {url} löschen? Noch wartende Zustellungen werden verworfen.",
  "settings.webhooks.docs": "Was ankommt und wie du es prüfst",
  "settings.webhooks.docsBody":
    "Ein {post} mit einem JSON-Inhalt wie diesem. {event} nennt das Ereignis, {delivery} ist je Zustellung eindeutig: Dasselbe Ereignis kann zweimal ankommen, überspring also IDs, die du schon gesehen hast.",
  "settings.webhooks.docsSignature":
    "{signature} ist {format}: ein HMAC-SHA256 von {signed} mit dem Signaturschlüssel des Webhooks. Zum Beispiel in Node.js:",
  "settings.webhooks.docsRetries":
    "Antworte innerhalb von 10 Sekunden mit einem 2xx-Status. Sonst versuchen wir es nach 1 und 5 Minuten, einer halben Stunde, dann nach 2, 6, 12 und 24 Stunden noch einmal. Zustellprotokolle bleiben 30 Tage gespeichert.",
  "settings.webhooks.copySecret":
    "Kopier den Signaturschlüssel jetzt: Er wird nur einmal angezeigt.",
  "settings.webhooks.full":
    "Diese Akademie hat schon so viele Webhooks wie möglich. Lösch einen, um einen weiteren hinzuzufügen.",
  "settings.webhooks.add": "Webhook hinzufügen",
  "settings.webhooks.url": "Adresse des Endpunkts",
  "settings.webhooks.events": "Ereignisse",
  "settings.webhooks.submit": "Webhook hinzufügen",
  "settings.webhooks.test": "Testereignis senden",
  "settings.webhooks.sending": "Wird gesendet…",
  "settings.webhooks.invalidUrl":
    "Gib die vollständige Adresse deines Endpunkts ein, z. B. https://hooks.example.com/academy.",
  "settings.webhooks.httpsOnly":
    "Nutze eine https-Adresse: Zustellungen enthalten Daten von Lernenden.",
  "settings.webhooks.noEvents": "Wähle mindestens ein Ereignis.",
  "settings.webhooks.limit": "Eine Akademie kann bis zu {max} Webhooks haben.",
  "settings.webhooks.group.learning": "Lernen",
  "settings.webhooks.group.credentials": "Abschlussbescheinigungen",
  "settings.webhooks.group.consent": "Einwilligung",
  "settings.webhooks.event.signup_completed": "Hat sich angemeldet",
  "settings.webhooks.event.course_started": "Hat einen Kurs begonnen",
  "settings.webhooks.event.lesson_completed": "Hat eine Lektion abgeschlossen",
  "settings.webhooks.event.assignment_submitted": "Hat eine Aufgabe abgegeben",
  "settings.webhooks.event.test_submitted": "Hat den Abschlusstest gemacht",
  "settings.webhooks.event.test_passed": "Hat den Abschlusstest bestanden",
  "settings.webhooks.event.review_completed": "Bewertung abgeschlossen",
  "settings.webhooks.event.review_passed": "Hat eine Aufgabe bestanden",
  "settings.webhooks.event.review_overridden": "Ergebnis von Prüfer:in geändert",
  "settings.webhooks.event.course_completed": "Hat einen Kurs abgeschlossen",
  "settings.webhooks.event.level_up": "Hat ein Level erreicht",
  "settings.webhooks.event.credential_made_public":
    "Hat eine Abschlussbescheinigung veröffentlicht",
  "settings.webhooks.event.credential_shared_linkedin":
    "Hat eine Abschlussbescheinigung auf LinkedIn geteilt",
  "settings.webhooks.event.verification_cta_clicked":
    "Besucher:in hat auf die Handlungsaufforderung einer Abschlussbescheinigung geklickt",
  "settings.webhooks.event.marketing_consent_confirmed": "Hat den Newsletter bestätigt",
  "settings.webhooks.event.marketing_consent_withdrawn": "Hat den Newsletter abbestellt",
  "settings.webhooks.event.contact_consent_given": "Hat einer Kontaktaufnahme zugestimmt",
  "settings.webhooks.event.contact_consent_withdrawn":
    "Hat die Einwilligung zur Kontaktaufnahme widerrufen",
  "settings.webhooks.event.ping": "Testereignis",
  "settings.webhooks.result.waiting": "Wartet",
  "settings.webhooks.result.blocked": "Blockiert: Die Adresse ist nicht öffentlich",
  "settings.webhooks.result.unreachable": "Keine Verbindung möglich",
  "settings.webhooks.result.paused": "Nicht gesendet: Der Webhook war pausiert",
  "settings.webhooks.result.delivered": "Zugestellt ({code})",
  "settings.webhooks.result.answered": "Antwortete mit {code}",

  "settings.warning.paths_unused": "Das Modul Lernpfade ist an, aber es gibt noch keine Lernpfade.",
  "settings.warning.paths_off": "Es gibt Lernpfade, aber das Modul Lernpfade ist aus.",
  "settings.warning.levels_unused": "Das Modul Level ist an, aber es gibt noch keine Level.",
  "settings.warning.levels_off": "Es gibt Level, aber das Modul Level ist aus.",
  "settings.warning.no_sender":
    "Noch keine eigene Absenderadresse: E-Mails gehen von der Adresse der Plattform raus.",
  "settings.warning.legal_placeholders":
    "Deine rechtlichen Links sehen nach Platzhaltern aus (doppelt oder auf eine Startseite): Trag vor dem Start die genauen Seiten ein.",
  "settings.warning.legal_missing":
    "Noch kein Impressum oder keine Datenschutzerklärung: Kurse lassen sich erst veröffentlichen, wenn beide eingetragen sind.",
  "settings.warning.font_unavailable":
    "Die Schrift „{family}“ ist weder enthalten noch hochgeladen: Browser weichen auf eine andere aus.",
  "settings.warning.course_not_publishable":
    "Kurs „{course}“: {reason} Er kann eingerichtet, aber nicht veröffentlicht werden.",
};
