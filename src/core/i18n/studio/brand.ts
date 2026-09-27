/** Studio strings: brand (see ./index.ts). Keys start with "brand.". */
export const en = {
  "brand.title": "Brand",

  // Import from the academy's website
  "brand.import.title": "Import from your website",
  "brand.import.intro":
    "We read your site’s colours, fonts and shapes and suggest a theme. Nothing is saved until you save.",
  "brand.import.urlLabel": "Website address",
  "brand.import.urlPlaceholder": "https://your-company.com",
  "brand.import.submit": "Import",
  "brand.import.pending": "Reading your website…",
  "brand.import.suggested": "Suggested from {source}. Check the preview, adjust, then save.",
  "brand.import.error.invalid_url": "Enter your website's address, e.g. your-company.com.",
  "brand.import.error.blocked":
    "This address cannot be read from our servers. Use your public website.",
  "brand.import.error.unreachable":
    "We could not reach this website. Check the address and try again.",
  "brand.import.error.not_html": "This address does not return a web page.",
  "brand.import.rateLimited": "Too many imports this hour. Try again later.",
  // Notes of the rule-based proposal (core/brand/propose.ts)
  "brand.import.note.noBrandColor":
    "No distinct brand colour found: primary starts as enaibler blue.",
  "brand.import.note.darkSite":
    "Your site is dark; the academy starts light for long reading. Adjust if you like.",
  "brand.import.note.font": "Your site uses “{site}”; closest open-source match: {font}.",
  "brand.import.note.allowance":
    "Your academy's AI allowance for this month is used up, so this proposal comes from the rules alone.",

  // Presets
  "brand.presets.title": "Or start from a preset",
  "brand.presets.clean": "Clean",
  "brand.presets.boldOutlined": "Bold outlined",
  "brand.presets.editorial": "Editorial",

  // Logo
  "brand.logo.title": "Logo",
  "brand.logo.hint":
    "In the header, on mails and on shared certificate images. SVG works best; PNG or WebP with a transparent background too.",
  "brand.logo.current": "Current logo",
  "brand.logo.none": "No logo yet: the academy name stands alone.",
  "brand.logo.upload": "Upload logo",
  "brand.logo.replace": "Replace logo",
  "brand.logo.uploadFailed": "The logo could not be uploaded.",
  "brand.logo.unreadable": "The logo could not be read.",
  "brand.logo.showName": "Show the academy name next to the logo",
  "brand.logo.showNameHint": "Turn it off when the logo already spells out the name.",

  // Colours
  "brand.colors.title": "Colours",
  "brand.colors.primary": "Primary",
  "brand.colors.primaryHint": "Buttons, links, highlights",
  "brand.colors.ink": "Text",
  "brand.colors.inkHint": "Text, outlines, hard shadows",
  "brand.colors.surface": "Background",
  "brand.colors.surfaceHint": "The page behind everything",
  "brand.colors.card": "Cards",
  "brand.colors.cardHint": "Panels, forms, lessons",
  "brand.colors.picker": "{label} colour picker",
  "brand.colors.autoButtonText": "Pick the button text colour automatically",
  "brand.colors.buttonText": "Button text",
  "brand.colors.accents": "Accents",
  "brand.colors.accentsHint": "Paths, course cards and decorations. Up to four.",
  "brand.colors.accent": "Accent {n}",
  "brand.colors.removeAccent": "Remove accent {n}",
  "brand.colors.addAccent": "+ Accent",

  // Fonts
  "brand.fonts.title": "Fonts",
  "brand.fonts.display": "Headings",
  "brand.fonts.body": "Text",
  "brand.fonts.yours": "Your fonts",
  "brand.fonts.openSource": "Open-source fonts",
  "brand.fonts.hosting":
    "Open-source fonts are hosted by us in the EU. Your own fonts are served from your academy’s address too, never from a font service.",
  "brand.fonts.own": "Your own fonts",
  "brand.fonts.italicWeight": "{weight} italic",
  "brand.fonts.remove": "Remove {font} {weight}",
  "brand.fonts.name": "Font name",
  "brand.fonts.nameRule": "Use letters, digits, spaces, _ and - for the font name.",
  "brand.fonts.weight": "Weight",
  "brand.fonts.italic": "Italic",
  "brand.fonts.add": "Add font",
  "brand.fonts.licence": "We hold a licence to use this font on the web",
  "brand.fonts.licenceHint":
    "One file per weight: .woff2 is best; .woff, .ttf or .otf also work (and are used for share images).",
  "brand.fonts.upload": "Upload font file",
  "brand.fonts.uploadFailed": "The font could not be uploaded.",
  "brand.fonts.unusable": "This is not a font file we can use.",
  // Weight names (core/theme/fonts.ts FONT_WEIGHT_NAMES)
  "brand.fonts.weight.100": "Thin",
  "brand.fonts.weight.200": "Extra light",
  "brand.fonts.weight.300": "Light",
  "brand.fonts.weight.400": "Regular",
  "brand.fonts.weight.500": "Medium",
  "brand.fonts.weight.600": "Semibold",
  "brand.fonts.weight.700": "Bold",
  "brand.fonts.weight.800": "Extra bold",
  "brand.fonts.weight.900": "Black",

  // Shape
  "brand.shape.title": "Shape",
  "brand.shape.style": "Style",
  "brand.shape.style.soft": "Soft",
  "brand.shape.style.softHint": "Rounded corners, soft shadows, cards lift on hover.",
  "brand.shape.style.outlined": "Outlined",
  "brand.shape.style.outlinedHint": "Ink outlines, hard offset shadows, buttons press in.",
  "brand.shape.radius": "Corner radius",
  "brand.shape.border": "Border width",
  "brand.shape.shadow": "Shadow",
  "brand.shape.shadow.soft": "Soft",
  "brand.shape.shadow.hard": "Hard offset",
  "brand.shape.shadow.none": "None",

  // Preview, contrast and saving
  "brand.preview": "Preview",
  "brand.preview.label": "Preview of your academy",
  "brand.contrast.text_on_surface":
    "Text on the page background is hard to read: contrast {ratio}:1, needs at least {needs}:1.",
  "brand.contrast.text_on_card":
    "Text on cards is hard to read: contrast {ratio}:1, needs at least {needs}:1.",
  "brand.contrast.text_on_primary":
    "Button text is hard to read: contrast {ratio}:1, needs at least {needs}:1.",
  "brand.save": "Save brand",
  "brand.reset": "Reset to enaibler’s default look",
  "brand.resetConfirm":
    "Go back to enaibler's default look? Your current brand settings are replaced.",
} as const;

export const de: Record<keyof typeof en, string> = {
  "brand.title": "Marke",

  "brand.import.title": "Von deiner Website übernehmen",
  "brand.import.intro":
    "Wir lesen Farben, Schriften und Formen deiner Website aus und schlagen dir ein Design vor. Gespeichert wird erst, wenn du speicherst.",
  "brand.import.urlLabel": "Adresse deiner Website",
  "brand.import.urlPlaceholder": "https://deine-firma.de",
  "brand.import.submit": "Übernehmen",
  "brand.import.pending": "Deine Website wird gelesen…",
  "brand.import.suggested":
    "Vorschlag auf Basis von {source}. Prüf die Vorschau, pass an, was du möchtest, und speichere dann.",
  "brand.import.error.invalid_url": "Gib die Adresse deiner Website ein, z. B. deine-firma.de.",
  "brand.import.error.blocked":
    "Diese Adresse können wir von unseren Servern aus nicht lesen. Nutze deine öffentliche Website.",
  "brand.import.error.unreachable":
    "Wir konnten diese Website nicht erreichen. Prüf die Adresse und versuch es noch einmal.",
  "brand.import.error.not_html": "Diese Adresse liefert keine Webseite.",
  "brand.import.rateLimited": "Zu viele Importe in dieser Stunde. Versuch es später noch einmal.",
  "brand.import.note.noBrandColor":
    "Keine eindeutige Markenfarbe gefunden: Die Hauptfarbe startet mit dem Blau von enaibler.",
  "brand.import.note.darkSite":
    "Deine Website ist dunkel; die Akademie startet hell, damit sich lange Texte gut lesen lassen. Pass das an, wenn du möchtest.",
  "brand.import.note.font":
    "Deine Website nutzt „{site}“; die ähnlichste Open-Source-Schrift ist {font}.",
  "brand.import.note.allowance":
    "Das KI-Kontingent deiner Akademie für diesen Monat ist aufgebraucht, deshalb stammt dieser Vorschlag nur aus den Regeln.",

  "brand.presets.title": "Oder starte mit einer Vorlage",
  "brand.presets.clean": "Schlicht",
  "brand.presets.boldOutlined": "Kräftig umrandet",
  "brand.presets.editorial": "Magazin",

  "brand.logo.title": "Logo",
  "brand.logo.hint":
    "In der Kopfzeile, in E-Mails und auf geteilten Bildern von Abschlussbescheinigungen. SVG eignet sich am besten, PNG oder WebP mit transparentem Hintergrund gehen auch.",
  "brand.logo.current": "Aktuelles Logo",
  "brand.logo.none": "Noch kein Logo: Der Name der Akademie steht für sich.",
  "brand.logo.upload": "Logo hochladen",
  "brand.logo.replace": "Logo ersetzen",
  "brand.logo.uploadFailed": "Das Logo konnte nicht hochgeladen werden.",
  "brand.logo.unreadable": "Das Logo konnte nicht gelesen werden.",
  "brand.logo.showName": "Namen der Akademie neben dem Logo zeigen",
  "brand.logo.showNameHint": "Schalte das aus, wenn das Logo den Namen schon enthält.",

  "brand.colors.title": "Farben",
  "brand.colors.primary": "Hauptfarbe",
  "brand.colors.primaryHint": "Buttons, Links, Hervorhebungen",
  "brand.colors.ink": "Textfarbe",
  "brand.colors.inkHint": "Text, Umrisse, harte Schatten",
  "brand.colors.surface": "Hintergrund",
  "brand.colors.surfaceHint": "Die Fläche hinter allem",
  "brand.colors.card": "Karten",
  "brand.colors.cardHint": "Kästen, Formulare, Lektionen",
  "brand.colors.picker": "Farbwähler: {label}",
  "brand.colors.autoButtonText": "Textfarbe der Buttons automatisch wählen",
  "brand.colors.buttonText": "Button-Text",
  "brand.colors.accents": "Akzentfarben",
  "brand.colors.accentsHint": "Lernpfade, Kurskarten und Verzierungen. Bis zu vier.",
  "brand.colors.accent": "Akzentfarbe {n}",
  "brand.colors.removeAccent": "Akzentfarbe {n} entfernen",
  "brand.colors.addAccent": "+ Akzentfarbe",

  "brand.fonts.title": "Schriften",
  "brand.fonts.display": "Überschriften",
  "brand.fonts.body": "Fließtext",
  "brand.fonts.yours": "Deine Schriften",
  "brand.fonts.openSource": "Open-Source-Schriften",
  "brand.fonts.hosting":
    "Open-Source-Schriften stellen wir selbst in der EU bereit. Auch deine eigenen Schriften kommen von der Adresse deiner Akademie, nie von einem Schriftendienst.",
  "brand.fonts.own": "Deine eigenen Schriften",
  "brand.fonts.italicWeight": "{weight} kursiv",
  "brand.fonts.remove": "{font} {weight} entfernen",
  "brand.fonts.name": "Name der Schrift",
  "brand.fonts.nameRule":
    "Nutze für den Namen der Schrift Buchstaben, Ziffern, Leerzeichen, _ und -.",
  "brand.fonts.weight": "Schriftstärke",
  "brand.fonts.italic": "Kursiv",
  "brand.fonts.add": "Schrift hinzufügen",
  "brand.fonts.licence": "Wir haben eine Lizenz, diese Schrift im Web zu nutzen",
  "brand.fonts.licenceHint":
    "Eine Datei pro Schriftstärke: .woff2 ist am besten; .woff, .ttf oder .otf gehen auch (und werden für Bilder zum Teilen verwendet).",
  "brand.fonts.upload": "Schriftdatei hochladen",
  "brand.fonts.uploadFailed": "Die Schrift konnte nicht hochgeladen werden.",
  "brand.fonts.unusable": "Das ist keine Schriftdatei, die wir verwenden können.",
  "brand.fonts.weight.100": "Dünn",
  "brand.fonts.weight.200": "Extraleicht",
  "brand.fonts.weight.300": "Leicht",
  "brand.fonts.weight.400": "Normal",
  "brand.fonts.weight.500": "Mittel",
  "brand.fonts.weight.600": "Halbfett",
  "brand.fonts.weight.700": "Fett",
  "brand.fonts.weight.800": "Extrafett",
  "brand.fonts.weight.900": "Schwarz",

  "brand.shape.title": "Form",
  "brand.shape.style": "Stil",
  "brand.shape.style.soft": "Weich",
  "brand.shape.style.softHint":
    "Runde Ecken, weiche Schatten, Karten heben sich unter dem Mauszeiger an.",
  "brand.shape.style.outlined": "Umrandet",
  "brand.shape.style.outlinedHint":
    "Umrisse in Textfarbe, harte versetzte Schatten, Buttons lassen sich eindrücken.",
  "brand.shape.radius": "Eckenradius",
  "brand.shape.border": "Rahmenbreite",
  "brand.shape.shadow": "Schatten",
  "brand.shape.shadow.soft": "Weich",
  "brand.shape.shadow.hard": "Hart versetzt",
  "brand.shape.shadow.none": "Keiner",

  "brand.preview": "Vorschau",
  "brand.preview.label": "Vorschau deiner Akademie",
  "brand.contrast.text_on_surface":
    "Text auf dem Seitenhintergrund ist schwer lesbar: Kontrast {ratio}:1, nötig sind mindestens {needs}:1.",
  "brand.contrast.text_on_card":
    "Text auf Karten ist schwer lesbar: Kontrast {ratio}:1, nötig sind mindestens {needs}:1.",
  "brand.contrast.text_on_primary":
    "Button-Text ist schwer lesbar: Kontrast {ratio}:1, nötig sind mindestens {needs}:1.",
  "brand.save": "Marke speichern",
  "brand.reset": "Auf das Standard-Aussehen von enaibler zurücksetzen",
  "brand.resetConfirm":
    "Zurück zum Standard-Aussehen von enaibler? Deine aktuellen Markeneinstellungen werden ersetzt.",
};
