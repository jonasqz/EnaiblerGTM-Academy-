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

  // Lesson editor page ({source} is a link to the source that changed)
  "lessons.editor.title": "Edit lesson",
  "lessons.editor.back": "All lessons",
  "lessons.editor.restored": "Version {version} restored",
  "lessons.editor.restoredBody":
    "It is now the newest version; the history keeps every earlier one.",
  "lessons.editor.newTranslation": "New {language} version",
  "lessons.editor.newTranslationBody":
    "Translate the title and write the text. The original is below the editor for reference.",
  "lessons.editor.changed.title": "A source of this lesson changed",
  "lessons.editor.changed.named":
    "{source} changed on {date}, after this lesson was written. Check that the lesson still holds, then mark it as reviewed.",
  "lessons.editor.changed.unnamed":
    "A source changed on {date}, after this lesson was written. Check that the lesson still holds, then mark it as reviewed.",
  "lessons.editor.markReviewed": "Mark as reviewed",
  "lessons.editor.languages": "Languages",
  "lessons.editor.thisOne": "{language} (this one)",
  "lessons.editor.addLanguage": "Add {language}",
  "lessons.editor.basedOn": "Based on",
  "lessons.editor.basedOnHint":
    "Web pages are read again every day. When one of them changes, this lesson is flagged for review.",
  "lessons.editor.saveSources": "Save sources",
  "lessons.editor.history": "Version history",
  "lessons.editor.current": "current",
  "lessons.editor.restore": "Restore version {version}",
  "lessons.editor.restoreConfirm":
    "Restore version {version}? Unsaved changes in the editor are lost.",

  // Lesson editor form
  "lessons.field.title": "Title",
  "lessons.editor.mode.write": "Write",
  "lessons.editor.mode.split": "Side by side",
  "lessons.editor.mode.preview": "Preview",
  "lessons.editor.view": "Editor view",
  "lessons.editor.media": "Image or video",
  "lessons.editor.mediaUpload": "Upload an image or video",
  "lessons.editor.uploading": "Uploading {percent} %",
  "lessons.editor.upload.tooLarge":
    "{name} is too large (images up to 10 MB, videos up to 500 MB).",
  "lessons.editor.upload.type": "{name} is not an image or MP4/WebM video.",
  "lessons.editor.upload.invalid": "{name} could not be read.",
  "lessons.editor.upload.rateLimited": "{name} was not uploaded: too many uploads this hour.",
  "lessons.editor.upload.failed": "{name} could not be uploaded.",
  "lessons.editor.stats.one": "{n} word · about {minutes} min read",
  "lessons.editor.stats.other": "{n} words · about {minutes} min read",
  "lessons.editor.textLabel": "Lesson text (Markdown)",
  "lessons.editor.placeholder":
    "## What you will do\n\nOne idea per lesson. Show an example, then ask the learner to apply it to their own work.",
  "lessons.editor.mediaHint": "Images and videos: upload them with the button above.",
  "lessons.editor.previewEmpty": "Nothing to preview yet.",
  "lessons.editor.teaches": "This lesson teaches",
  "lessons.editor.noCriteria": "The rubric has no criteria yet.",
  "lessons.editor.reference": "Reference: {language} version",
  "lessons.editor.noContent": "No content yet.",
  "lessons.editor.unsaved": "Unsaved changes",
  "lessons.editor.saved": "All changes saved",
  "lessons.editor.everySave": "every save is a new version",
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

  "lessons.editor.title": "Lektion bearbeiten",
  "lessons.editor.back": "Alle Lektionen",
  "lessons.editor.restored": "Version {version} wiederhergestellt",
  "lessons.editor.restoredBody":
    "Sie ist jetzt die neueste Version; der Verlauf behält alle früheren.",
  "lessons.editor.newTranslation": "Neue Fassung auf {language}",
  "lessons.editor.newTranslationBody":
    "Übersetze den Titel und schreib den Text. Das Original steht zum Nachschlagen unter dem Editor.",
  "lessons.editor.changed.title": "Eine Quelle dieser Lektion hat sich geändert",
  "lessons.editor.changed.named":
    "{source} hat sich am {date} geändert, nachdem diese Lektion geschrieben wurde. Prüf, ob die Lektion noch stimmt, und markiere sie dann als geprüft.",
  "lessons.editor.changed.unnamed":
    "Eine Quelle hat sich am {date} geändert, nachdem diese Lektion geschrieben wurde. Prüf, ob die Lektion noch stimmt, und markiere sie dann als geprüft.",
  "lessons.editor.markReviewed": "Als geprüft markieren",
  "lessons.editor.languages": "Sprachen",
  "lessons.editor.thisOne": "{language} (diese Fassung)",
  "lessons.editor.addLanguage": "{language} hinzufügen",
  "lessons.editor.basedOn": "Beruht auf",
  "lessons.editor.basedOnHint":
    "Webseiten werden jeden Tag neu gelesen. Ändert sich eine davon, wird diese Lektion zur Prüfung markiert.",
  "lessons.editor.saveSources": "Quellen speichern",
  "lessons.editor.history": "Versionsverlauf",
  "lessons.editor.current": "aktuell",
  "lessons.editor.restore": "Version {version} wiederherstellen",
  "lessons.editor.restoreConfirm":
    "Version {version} wiederherstellen? Ungespeicherte Änderungen im Editor gehen verloren.",

  "lessons.field.title": "Titel",
  "lessons.editor.mode.write": "Schreiben",
  "lessons.editor.mode.split": "Nebeneinander",
  "lessons.editor.mode.preview": "Vorschau",
  "lessons.editor.view": "Editoransicht",
  "lessons.editor.media": "Bild oder Video",
  "lessons.editor.mediaUpload": "Bild oder Video hochladen",
  "lessons.editor.uploading": "Wird hochgeladen: {percent} %",
  "lessons.editor.upload.tooLarge": "{name} ist zu groß (Bilder bis 10 MB, Videos bis 500 MB).",
  "lessons.editor.upload.type": "{name} ist weder ein Bild noch ein MP4- oder WebM-Video.",
  "lessons.editor.upload.invalid": "{name} konnte nicht gelesen werden.",
  "lessons.editor.upload.rateLimited":
    "{name} wurde nicht hochgeladen: zu viele Uploads in dieser Stunde.",
  "lessons.editor.upload.failed": "{name} konnte nicht hochgeladen werden.",
  "lessons.editor.stats.one": "{n} Wort · etwa {minutes} Min. Lesezeit",
  "lessons.editor.stats.other": "{n} Wörter · etwa {minutes} Min. Lesezeit",
  "lessons.editor.textLabel": "Lektionstext (Markdown)",
  "lessons.editor.placeholder":
    "## Was du tun wirst\n\nEine Idee pro Lektion. Zeig ein Beispiel und lass die Lernenden es dann auf ihre eigene Arbeit anwenden.",
  "lessons.editor.mediaHint": "Bilder und Videos: Lade sie mit dem Button oben hoch.",
  "lessons.editor.previewEmpty": "Noch nichts zu sehen.",
  "lessons.editor.teaches": "Diese Lektion vermittelt",
  "lessons.editor.noCriteria": "Das Bewertungsraster hat noch keine Kriterien.",
  "lessons.editor.reference": "Zum Nachschlagen: Fassung auf {language}",
  "lessons.editor.noContent": "Noch kein Inhalt.",
  "lessons.editor.unsaved": "Ungespeicherte Änderungen",
  "lessons.editor.saved": "Alle Änderungen gespeichert",
  "lessons.editor.everySave": "jedes Speichern ergibt eine neue Version",
};
