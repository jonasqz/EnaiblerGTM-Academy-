/** Studio strings: lessons (see ./index.ts). Keys start with "lessons.". */
export const en = {
  "lessons.version": "Version {version}",

  // Lesson list
  "lessons.list.title": "Lessons",
  "lessons.list.intro":
    "Short lessons, each teaching one or more rubric criteria. Translations share progress, so learners can switch language.",
  "lessons.list.errorLanguage": "Pick one of the course languages.",
  "lessons.list.empty": "No lessons yet",
  "lessons.list.emptyBody":
    "Work backwards from the rubric: one lesson for each thing a good result needs.",
  "lessons.list.caption": "Lessons and their languages",
  "lessons.list.lesson": "Lesson",
  "lessons.list.teaches": "Teaches",
  "lessons.list.actions": "Order and delete",
  "lessons.list.translate": "Translate",
  "lessons.list.noContent": "No content yet",
  "lessons.list.sourceChanged": "Source changed: review",
  "lessons.list.moveUp": "Move up",
  "lessons.list.moveDown": "Move down",
  "lessons.list.delete": "Delete lesson",
  "lessons.list.deleteConfirm":
    "Delete “{title}” in every language? Learners' progress on it is kept but no longer counted.",
  "lessons.list.new": "New lesson",
  "lessons.list.newPlaceholder": "Lesson title",
  "lessons.list.add": "Add lesson",

  // Drafting lessons with AI ({sources} is a link to the Sources tab)
  "lessons.draft.title": "Draft lessons with AI",
  "lessons.draft.intro":
    "Written backwards from the rubric, from {sources}. Drafts are added as new lessons for you to edit.",
  "lessons.draft.sourcesNone": "your sources (none yet: add a recording or document first)",
  "lessons.draft.sources.one": "{n} source",
  "lessons.draft.sources.other": "{n} sources",
  "lessons.draft.added.one": "Added {n} lesson",
  "lessons.draft.added.other": "Added {n} lessons",
  "lessons.draft.failed": "Failed",
  "lessons.draft.drafting": "Drafting…",
  "lessons.draft.language": "Language of the drafts",
  "lessons.draft.starting": "Starting…",
  "lessons.draft.submit": "Draft lessons",
  "lessons.draft.limit": "Too many drafts this hour. Try again later.",
  "lessons.draft.running": "Drafting lessons",
  "lessons.draft.runningBody":
    "This takes a minute or two. New lessons appear below; nothing is published.",

  // Coverage map
  "lessons.coverage.title": "Coverage",
  "lessons.coverage.intro":
    "Which lesson teaches which criterion. Tick criteria in the lesson editor.",
  "lessons.coverage.notTaught": "Not taught",
} as const;

export const de: Record<keyof typeof en, string> = {
  "lessons.version": "Version {version}",

  "lessons.list.title": "Lektionen",
  "lessons.list.intro":
    "Kurze Lektionen, jede vermittelt ein oder mehrere Kriterien des Bewertungsrasters. Übersetzungen teilen sich den Fortschritt, so können Lernende die Sprache wechseln.",
  "lessons.list.errorLanguage": "Wähle eine der Kurssprachen.",
  "lessons.list.empty": "Noch keine Lektionen",
  "lessons.list.emptyBody":
    "Denk vom Bewertungsraster her: eine Lektion für alles, was ein gutes Ergebnis braucht.",
  "lessons.list.caption": "Lektionen und ihre Sprachen",
  "lessons.list.lesson": "Lektion",
  "lessons.list.teaches": "Vermittelt",
  "lessons.list.actions": "Reihenfolge und Löschen",
  "lessons.list.translate": "Übersetzen",
  "lessons.list.noContent": "Noch kein Inhalt",
  "lessons.list.sourceChanged": "Quelle geändert: prüfen",
  "lessons.list.moveUp": "Nach oben verschieben",
  "lessons.list.moveDown": "Nach unten verschieben",
  "lessons.list.delete": "Lektion löschen",
  "lessons.list.deleteConfirm":
    "„{title}“ in allen Sprachen löschen? Der Fortschritt der Lernenden darin bleibt erhalten, zählt aber nicht mehr.",
  "lessons.list.new": "Neue Lektion",
  "lessons.list.newPlaceholder": "Titel der Lektion",
  "lessons.list.add": "Lektion hinzufügen",

  "lessons.draft.title": "Lektionen mit KI entwerfen",
  "lessons.draft.intro":
    "Vom Bewertungsraster her gedacht, gestützt auf {sources}. Entwürfe kommen als neue Lektionen dazu, die du dann bearbeitest.",
  "lessons.draft.sourcesNone":
    "deine Quellen (noch keine: füge zuerst eine Aufnahme oder ein Dokument hinzu)",
  "lessons.draft.sources.one": "{n} Quelle",
  "lessons.draft.sources.other": "{n} Quellen",
  "lessons.draft.added.one": "{n} Lektion hinzugefügt",
  "lessons.draft.added.other": "{n} Lektionen hinzugefügt",
  "lessons.draft.failed": "Fehlgeschlagen",
  "lessons.draft.drafting": "Wird entworfen…",
  "lessons.draft.language": "Sprache der Entwürfe",
  "lessons.draft.starting": "Wird gestartet…",
  "lessons.draft.submit": "Lektionen entwerfen",
  "lessons.draft.limit": "Zu viele Entwürfe in dieser Stunde. Versuch es später noch einmal.",
  "lessons.draft.running": "Lektionen werden entworfen",
  "lessons.draft.runningBody":
    "Das dauert ein, zwei Minuten. Neue Lektionen erscheinen unten; veröffentlicht wird nichts.",

  "lessons.coverage.title": "Abdeckung",
  "lessons.coverage.intro":
    "Welche Lektion welches Kriterium vermittelt. Die Kriterien hakst du im Lektionseditor an.",
  "lessons.coverage.notTaught": "Nicht vermittelt",
};
