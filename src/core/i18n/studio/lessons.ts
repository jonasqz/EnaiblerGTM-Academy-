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

  // Sources ({lessons} is a link to the Lessons tab)
  "lessons.sources.title": "Sources",
  "lessons.sources.intro":
    "What the AI drafts your lessons from: screen recordings and webinars, documents, your web pages, an interview with you and the questions from a live Q&A.",
  "lessons.sources.drafting": "Drafting starts on the {lessons} tab.",
  "lessons.sources.draftingReady.one":
    "Drafting starts on the {lessons} tab and uses the {n} ready source.",
  "lessons.sources.draftingReady.other":
    "Drafting starts on the {lessons} tab and uses the {n} ready sources.",
  "lessons.sources.interviewSaved": "Interview saved as a source",
  "lessons.sources.checked.changed":
    "The page changed. Lessons written from it are flagged for review.",
  "lessons.sources.checked.unchanged": "No change since the last check.",
  "lessons.sources.checked.failed": "The page could not be read. The text read before is kept.",
  "lessons.sources.checked.skipped": "Only web pages that were read successfully can be checked.",
  "lessons.sources.checked.limit": "Too many checks this hour. Try again later.",
  "lessons.sources.kind.recording": "Recording",
  "lessons.sources.kind.document": "Document",
  "lessons.sources.kind.url": "Web page",
  "lessons.sources.kind.interview": "Interview",
  "lessons.sources.kind.qa": "Live Q&A",
  "lessons.sources.empty": "No sources yet",
  "lessons.sources.emptyBody":
    "Lessons can be drafted without sources too, but they will be generic. A ten-minute recording of you doing the work is the best source.",
  "lessons.sources.steps.one": "{n} step",
  "lessons.sources.steps.other": "{n} steps",
  "lessons.sources.words.one": "{n} word",
  "lessons.sources.words.other": "{n} words",
  "lessons.sources.checkedDaily": "Checked daily · last {date}",
  "lessons.sources.changed": "Changed {date}",
  "lessons.sources.checking": "Checking…",
  "lessons.sources.checkNow": "Check now",
  "lessons.sources.delete": "Delete {title}",
  "lessons.sources.deleteConfirm": "Delete this source? Lessons already written stay as they are.",

  // Adding a source
  "lessons.addSource.title": "Add a source",
  "lessons.addSource.privacy":
    "Everything stays on our servers in the EU: recordings are transcribed on our own speech recognition.",
  "lessons.addSource.kind": "Kind of source",
  "lessons.addSource.hint.recording":
    "A screen recording with narration (MP4, WebM, MOV or audio). We transcribe it, split it into steps and take a screenshot of each.",
  "lessons.addSource.hint.document":
    "A PDF, Markdown or text file: a whitepaper, a framework, your notes.",
  "lessons.addSource.hint.url":
    "A blog post or article of yours. We read the page, not the whole site.",
  "lessons.addSource.url": "Address of the page",
  "lessons.addSource.locale": "Spoken or written in",
  "lessons.addSource.submit": "Add source",
  "lessons.addSource.uploading": "Uploading… {percent} %",
  "lessons.addSource.tooLarge": "{name} is too large (up to 2 GB).",
  "lessons.addSource.uploadFirst": "Upload the file first.",
  "lessons.addSource.notMedia": "That is not a video or audio file.",
  "lessons.addSource.mediaAsDocument": "Upload recordings as recordings, not as documents.",
  "lessons.addSource.urlInvalid": "Enter the page's address, e.g. https://example.com/article.",
  "lessons.addSource.chooseKind": "Choose what to add.",
  "lessons.addSource.recordingAdded": "Recording added. Transcription runs in the background.",
  "lessons.addSource.added": "Source added. Reading it takes a moment.",

  // One source: what the AI reads from it
  "lessons.source.title": "Source",
  "lessons.source.back": "All sources",
  "lessons.source.steps": "Steps",
  "lessons.source.stepsPending": "Steps (screenshots are being taken…)",
  "lessons.source.screenshot": "Screenshot: {title}",
  "lessons.source.stepInline": "step {n}",
  "lessons.source.step": "Step {n}",
  "lessons.source.text": "Text the AI reads",

  // Expertise interview (the questions themselves are content, in the course's language)
  "lessons.interview.title": "Expert interview",
  "lessons.interview.intro":
    "Your experience is what makes the course yours. Answer in your own words; skip what does not apply. The answers become a source for the lesson drafts.",
  "lessons.interview.thinking": "Thinking…",
  "lessons.interview.suggest": "Suggest questions for this course",
  "lessons.interview.answerPlaceholder":
    "Answer as you would to a colleague: examples, mistakes you see, rules of thumb.",
  "lessons.interview.ownQuestion": "Your own question",
  "lessons.interview.addQuestion": "Add a question",
  "lessons.interview.save": "Save interview as a source",
  "lessons.interview.limit": "Too many requests this hour.",
  "lessons.interview.standard": "Using the standard questions.",
  "lessons.interview.allowance":
    "Your academy's AI allowance for this month is used up: using the standard questions.",
  "lessons.interview.answerOne": "Answer at least one question.",

  // Knowledge check: optional practice questions at the end of a lesson (lesson editor)
  "lessons.check.title": "Knowledge check",
  "lessons.check.count.one": "{n} question",
  "lessons.check.count.other": "{n} questions",
  "lessons.check.intro":
    "Practice at the end of the lesson: learners check their own answers. Not graded, not stored, no AI.",
  "lessons.check.empty":
    "Let learners practise what this lesson teaches with a few multiple-choice questions: not graded, no AI involved.",
  "lessons.check.addFirst": "Add a first question",
  "lessons.check.add": "Add a question",
  "lessons.check.limit": "A lesson can have up to {max} questions.",
  "lessons.check.question": "Question {n}",
  "lessons.check.prompt": "Question text",
  "lessons.check.answers": "Answers",
  "lessons.check.answersHint":
    "Tick the right answer. If several are right, learners are asked to choose all that apply.",
  "lessons.check.answer": "Answer {n}",
  "lessons.check.right": "Right answer",
  "lessons.check.addAnswer": "Add an answer",
  "lessons.check.removeAnswer": "Remove answer {n}",
  "lessons.check.noRight": "Tick at least one right answer.",
  "lessons.check.explanation": "Explanation",
  "lessons.check.explanationHint":
    "Learners see it after checking their answers, whether they were right or not.",
  "lessons.check.moveUp": "Move question {n} up",
  "lessons.check.moveDown": "Move question {n} down",
  "lessons.check.remove": "Remove question {n}",
  "lessons.check.removeConfirm": "Remove question {n} with its answers?",
  "lessons.check.error.unreadable":
    "The knowledge check could not be read. Reload the page and try again.",
  "lessons.check.error.tooMany": "A lesson can have up to {max} knowledge check questions.",
  "lessons.check.error.promptMissing": "Question {n} has no text yet.",
  "lessons.check.error.promptLong": "Question {n} is too long (up to {max} characters).",
  "lessons.check.error.optionsFew": "Question {n} needs at least {min} answers.",
  "lessons.check.error.optionsMany": "Question {n} can have up to {max} answers.",
  "lessons.check.error.optionMissing": "Question {n}: answer {answer} is empty.",
  "lessons.check.error.optionLong":
    "Question {n}: answer {answer} is too long (up to {max} characters).",
  "lessons.check.error.noRight": "Question {n}: tick at least one right answer.",
  "lessons.check.error.explanationLong":
    "Question {n}: the explanation is too long (up to {max} characters).",
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

  "lessons.sources.title": "Quellen",
  "lessons.sources.intro":
    "Daraus entwirft die KI deine Lektionen: Bildschirmaufnahmen und Webinare, Dokumente, deine Webseiten, ein Interview mit dir und die Fragen aus einer Live-Fragerunde.",
  "lessons.sources.drafting": "Das Entwerfen startest du im Tab {lessons}.",
  "lessons.sources.draftingReady.one":
    "Das Entwerfen startest du im Tab {lessons}; es nutzt {n} einsatzbereite Quelle.",
  "lessons.sources.draftingReady.other":
    "Das Entwerfen startest du im Tab {lessons}; es nutzt {n} einsatzbereite Quellen.",
  "lessons.sources.interviewSaved": "Interview als Quelle gespeichert",
  "lessons.sources.checked.changed":
    "Die Seite hat sich geändert. Lektionen, die darauf beruhen, sind jetzt zur Prüfung markiert.",
  "lessons.sources.checked.unchanged": "Keine Änderung seit der letzten Prüfung.",
  "lessons.sources.checked.failed":
    "Die Seite konnte nicht gelesen werden. Der zuvor gelesene Text bleibt erhalten.",
  "lessons.sources.checked.skipped":
    "Prüfen lassen sich nur Webseiten, die erfolgreich gelesen wurden.",
  "lessons.sources.checked.limit":
    "Zu viele Prüfungen in dieser Stunde. Versuch es später noch einmal.",
  "lessons.sources.kind.recording": "Aufnahme",
  "lessons.sources.kind.document": "Dokument",
  "lessons.sources.kind.url": "Webseite",
  "lessons.sources.kind.interview": "Interview",
  "lessons.sources.kind.qa": "Live-Fragerunde",
  "lessons.sources.empty": "Noch keine Quellen",
  "lessons.sources.emptyBody":
    "Lektionen lassen sich auch ohne Quellen entwerfen, bleiben dann aber allgemein. Die beste Quelle ist eine zehnminütige Aufnahme, in der du die Arbeit selbst machst.",
  "lessons.sources.steps.one": "{n} Schritt",
  "lessons.sources.steps.other": "{n} Schritte",
  "lessons.sources.words.one": "{n} Wort",
  "lessons.sources.words.other": "{n} Wörter",
  "lessons.sources.checkedDaily": "Täglich geprüft · zuletzt am {date}",
  "lessons.sources.changed": "Geändert am {date}",
  "lessons.sources.checking": "Wird geprüft…",
  "lessons.sources.checkNow": "Jetzt prüfen",
  "lessons.sources.delete": "{title} löschen",
  "lessons.sources.deleteConfirm":
    "Diese Quelle löschen? Bereits geschriebene Lektionen bleiben, wie sie sind.",

  "lessons.addSource.title": "Quelle hinzufügen",
  "lessons.addSource.privacy":
    "Alles bleibt auf unseren Servern in der EU: Aufnahmen werden mit unserer eigenen Spracherkennung transkribiert.",
  "lessons.addSource.kind": "Art der Quelle",
  "lessons.addSource.hint.recording":
    "Eine Bildschirmaufnahme mit Kommentar (MP4, WebM, MOV oder Audio). Wir transkribieren sie, teilen sie in Schritte auf und machen von jedem ein Bildschirmfoto.",
  "lessons.addSource.hint.document":
    "Eine PDF-, Markdown- oder Textdatei: ein Whitepaper, ein Framework, deine Notizen.",
  "lessons.addSource.hint.url":
    "Ein Blogbeitrag oder Artikel von dir. Wir lesen die Seite, nicht die ganze Website.",
  "lessons.addSource.url": "Adresse der Seite",
  "lessons.addSource.locale": "Gesprochen oder geschrieben auf",
  "lessons.addSource.submit": "Quelle hinzufügen",
  "lessons.addSource.uploading": "Wird hochgeladen… {percent} %",
  "lessons.addSource.tooLarge": "{name} ist zu groß (bis 2 GB).",
  "lessons.addSource.uploadFirst": "Lade zuerst die Datei hoch.",
  "lessons.addSource.notMedia": "Das ist keine Video- oder Audiodatei.",
  "lessons.addSource.mediaAsDocument": "Lade Aufnahmen als Aufnahme hoch, nicht als Dokument.",
  "lessons.addSource.urlInvalid":
    "Gib die Adresse der Seite ein, z. B. https://example.com/article.",
  "lessons.addSource.chooseKind": "Wähle, was du hinzufügen möchtest.",
  "lessons.addSource.recordingAdded":
    "Aufnahme hinzugefügt. Die Transkription läuft im Hintergrund.",
  "lessons.addSource.added": "Quelle hinzugefügt. Das Lesen dauert einen Moment.",

  "lessons.source.title": "Quelle",
  "lessons.source.back": "Alle Quellen",
  "lessons.source.steps": "Schritte",
  "lessons.source.stepsPending": "Schritte (Bildschirmfotos werden erstellt…)",
  "lessons.source.screenshot": "Bildschirmfoto: {title}",
  "lessons.source.stepInline": "Schritt {n}",
  "lessons.source.step": "Schritt {n}",
  "lessons.source.text": "Text, den die KI liest",

  "lessons.interview.title": "Expertise-Interview",
  "lessons.interview.intro":
    "Deine Erfahrung macht den Kurs zu deinem. Antworte in deinen eigenen Worten und überspring, was nicht passt. Aus den Antworten wird eine Quelle für die Lektionsentwürfe.",
  "lessons.interview.thinking": "Denkt nach…",
  "lessons.interview.suggest": "Fragen für diesen Kurs vorschlagen",
  "lessons.interview.answerPlaceholder":
    "Antworte wie im Gespräch unter Kolleg:innen: Beispiele, Fehler, die du oft siehst, Faustregeln.",
  "lessons.interview.ownQuestion": "Deine eigene Frage",
  "lessons.interview.addQuestion": "Frage hinzufügen",
  "lessons.interview.save": "Interview als Quelle speichern",
  "lessons.interview.limit": "Zu viele Anfragen in dieser Stunde.",
  "lessons.interview.standard": "Es werden die Standardfragen verwendet.",
  "lessons.interview.allowance":
    "Das KI-Kontingent deiner Akademie für diesen Monat ist aufgebraucht: Es werden die Standardfragen verwendet.",
  "lessons.interview.answerOne": "Beantworte mindestens eine Frage.",

  "lessons.check.title": "Wissenscheck",
  "lessons.check.count.one": "{n} Frage",
  "lessons.check.count.other": "{n} Fragen",
  "lessons.check.intro":
    "Zum Üben am Ende der Lektion: Lernende prüfen ihre Antworten selbst. Ohne Bewertung, ohne Speichern, ohne KI.",
  "lessons.check.empty":
    "Lass Lernende mit ein paar Multiple-Choice-Fragen üben, was diese Lektion vermittelt: ohne Bewertung und ohne KI.",
  "lessons.check.addFirst": "Erste Frage hinzufügen",
  "lessons.check.add": "Frage hinzufügen",
  "lessons.check.limit": "Eine Lektion kann bis zu {max} Fragen haben.",
  "lessons.check.question": "Frage {n}",
  "lessons.check.prompt": "Fragetext",
  "lessons.check.answers": "Antworten",
  "lessons.check.answersHint":
    "Hak die richtige Antwort an. Sind mehrere richtig, sollen Lernende alle zutreffenden wählen.",
  "lessons.check.answer": "Antwort {n}",
  "lessons.check.right": "Richtige Antwort",
  "lessons.check.addAnswer": "Antwort hinzufügen",
  "lessons.check.removeAnswer": "Antwort {n} entfernen",
  "lessons.check.noRight": "Hak mindestens eine richtige Antwort an.",
  "lessons.check.explanation": "Erklärung",
  "lessons.check.explanationHint":
    "Lernende sehen sie, nachdem sie ihre Antworten geprüft haben, ob richtig oder nicht.",
  "lessons.check.moveUp": "Frage {n} nach oben verschieben",
  "lessons.check.moveDown": "Frage {n} nach unten verschieben",
  "lessons.check.remove": "Frage {n} entfernen",
  "lessons.check.removeConfirm": "Frage {n} mit ihren Antworten entfernen?",
  "lessons.check.error.unreadable":
    "Der Wissenscheck konnte nicht gelesen werden. Lade die Seite neu und versuch es noch einmal.",
  "lessons.check.error.tooMany": "Eine Lektion kann bis zu {max} Fragen im Wissenscheck haben.",
  "lessons.check.error.promptMissing": "Frage {n} hat noch keinen Text.",
  "lessons.check.error.promptLong": "Frage {n} ist zu lang (höchstens {max} Zeichen).",
  "lessons.check.error.optionsFew": "Frage {n} braucht mindestens {min} Antworten.",
  "lessons.check.error.optionsMany": "Frage {n} kann höchstens {max} Antworten haben.",
  "lessons.check.error.optionMissing": "Frage {n}: Antwort {answer} ist leer.",
  "lessons.check.error.optionLong":
    "Frage {n}: Antwort {answer} ist zu lang (höchstens {max} Zeichen).",
  "lessons.check.error.noRight": "Frage {n}: Hak mindestens eine richtige Antwort an.",
  "lessons.check.error.explanationLong":
    "Frage {n}: Die Erklärung ist zu lang (höchstens {max} Zeichen).",
};
