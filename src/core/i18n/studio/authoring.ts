/** Studio strings: authoring (see ./index.ts). Keys start with "authoring.". */
export const en = {
  // Outcome and rubric page
  "authoring.outcome.title": "Outcome and rubric",
  "authoring.outcome.created.title": "Course created as a draft",
  "authoring.outcome.created.body":
    "It starts with a generic rubric. Make the criteria specific to your artifact, then add lessons that teach them.",
  "authoring.outcome.build.title": "1. What learners build",
  "authoring.outcome.build.body":
    "Learners see this as their “{artifact}”. The name appears on the Certificate of Completion.",
  "authoring.outcome.artifactName": "Name of the work",
  "authoring.outcome.prompt": "Assignment",
  "authoring.outcome.promptHint": "What to hand in, which parts it needs, how long it should be.",
  "authoring.outcome.handIn.title": "2. How learners hand it in",
  "authoring.outcome.handIn.body":
    "Pick at least one. The AI review reads text, PDFs, images (through vision), form fields and the link.",
  "authoring.outcome.handIn.text": "Written text",
  "authoring.outcome.handIn.textBody": "Typed, pasted or a Markdown file.",
  "authoring.outcome.handIn.pdf": "A PDF",
  "authoring.outcome.handIn.pdfBody": "A document, slides or a one-pager.",
  "authoring.outcome.handIn.image": "Images",
  "authoring.outcome.handIn.imageBody": "Screenshots, photos of a whiteboard.",
  "authoring.outcome.handIn.url": "A link",
  "authoring.outcome.handIn.urlBody": "A board, document or prototype.",
  "authoring.outcome.handIn.form": "A template form",
  "authoring.outcome.handIn.formBody": "Named fields, reviewed as structured data.",
  "authoring.outcome.formSchema": "Form fields (JSON schema)",
  "authoring.outcome.formSchemaHint":
    "An object with text fields: title, description, maxLength; list required fields in “required”.",
  "authoring.outcome.maxMb": "Largest file",
  "authoring.outcome.maxMbHint":
    "Up to 5 files per attempt. Photos are stored without location data.",
  "authoring.outcome.rubric.title": "3. Rubric",
  "authoring.outcome.rubric.body":
    "What a reviewer scores. Pass or fail is computed from the scores, never taken from the AI. Changing the rubric creates a new version; earlier reviews keep theirs.",
  "authoring.outcome.appliesToNew": "Saved changes apply to new submissions.",
  "authoring.outcome.save": "Save outcome and rubric",

  // Draft the rubric with AI
  "authoring.draft.title": "Draft the rubric with AI",
  "authoring.draft.intro":
    "Uses the outcome above and, ideally, one example of good work. You review the draft before anything is saved.",
  "authoring.draft.example": "Example of good work (optional)",
  "authoring.draft.examplePlaceholder":
    "Paste a finished piece of work you would pass without hesitation.",
  "authoring.draft.keepExample": "Keep the example as a passing calibration example",
  "authoring.draft.run": "Draft rubric",
  "authoring.draft.drafting": "Drafting…",
  "authoring.draft.close": "Close",
  "authoring.draft.replaceConfirm":
    "Lessons point at the current criteria. A new rubric replaces them, and those lessons lose their link in the coverage map until you pick criteria again. Draft anyway?",
  "authoring.draft.ready":
    "Draft ready below. Read every criterion, change what does not fit, then save.",
  "authoring.draft.noGateway":
    "Drafting needs the AI gateway (LLM_BASE_URL). Write the rubric below instead.",
  "authoring.draft.rateLimited": "Too many drafts this hour. Try again later.",
  "authoring.draft.unusable": "The draft did not come out usable. Try again.",
  "authoring.draft.noAnswer": "The AI gateway did not answer. Try again in a moment.",

  // Rubric editor
  "authoring.rubric.passAt": "Pass at",
  "authoring.rubric.passAtHint": "Of the weighted score across all criteria.",
  "authoring.rubric.whoDecides": "Who decides",
  "authoring.rubric.mode.ai_auto.title": "AI decides, humans spot-check",
  "authoring.rubric.mode.ai_auto.body":
    "Results reach learners at once. The first passes and then a sample go to the review queue; results near the threshold and repeated fails wait for a human.",
  "authoring.rubric.mode.ai_then_human.title": "AI drafts, a human confirms",
  "authoring.rubric.mode.ai_then_human.body":
    "Every result waits in the review queue with the AI scores filled in.",
  "authoring.rubric.mode.human_only.title": "Humans only",
  "authoring.rubric.mode.human_only.body":
    "No AI review. Every submission goes to the review queue.",
  "authoring.rubric.criterion": "Criterion {n}",
  "authoring.rubric.weight": "Weight",
  "authoring.rubric.share": "{share} % of score",
  "authoring.rubric.removeCriterion": "Remove criterion",
  "authoring.rubric.removeCriterionLabel": "Remove criterion {n}",
  "authoring.rubric.removeCriterionConfirm":
    "Remove this criterion? Lessons that teach it lose the link, earlier reviews keep their scores.",
  "authoring.rubric.name": "Name",
  "authoring.rubric.namePlaceholder": "e.g. Evidence",
  "authoring.rubric.looksFor": "What the reviewer looks for",
  "authoring.rubric.levels": "Score levels",
  "authoring.rubric.score": "Score",
  "authoring.rubric.levelLabel": "Score {score}, {language}",
  "authoring.rubric.addLevel": "Add a level",
  "authoring.rubric.removeTopLevel": "Remove the top level",
  "authoring.rubric.addCriterion": "Add a criterion",
  "authoring.rubric.spotChecks": "Spot checks and escalation",
  "authoring.rubric.spotChecksBody":
    "Defaults follow the brief: every AI pass is checked until the first 20, then a sample. Change them once you have data.",
  "authoring.rubric.initialChecks": "Check every pass until pass no.",
  "authoring.rubric.spotCheckRate": "Then spot-check (%)",
  "authoring.rubric.agreementAt": "Once AI and humans agree (%)",
  "authoring.rubric.reducedRate": "… lower the spot checks to (%)",
  "authoring.rubric.nearThreshold": "Hold results within ± points of the threshold",
  "authoring.rubric.failedAttempt": "Hold failed results from attempt no.",
  "authoring.rubric.off": "Off",

  // Calibrate the review
  "authoring.calibrate.title": "Calibrate",
  "authoring.calibrate.heading": "Calibrate the review",
  // {rubric} marks where the link to the rubric goes.
  "authoring.calibrate.intro":
    "Before learners hand in, check that the AI judges like you do. Add a few examples you would pass and a few you would not, then let the AI review them. Where it disagrees, sharpen the {rubric}. Live reviews also see up to two examples of each kind.",
  "authoring.calibrate.introRubric": "rubric",
  "authoring.calibrate.noGateway.title": "The AI gateway is not set up",
  "authoring.calibrate.noGateway.body":
    "Calibration runs the AI review, which needs LLM_BASE_URL on the server.",
  "authoring.calibrate.needExamples":
    "Add at least one example you would pass and one you would not.",
  "authoring.calibrate.rateLimited": "Too many runs this hour. Try again later.",
  "authoring.calibrate.running": "The AI is reviewing your examples…",
  "authoring.calibrate.agreement":
    "The AI agreed with you on {agreed} of {total} examples ({percent} %)",
  "authoring.calibrate.notYet": "Not calibrated yet",
  "authoring.calibrate.rubricVersion": "On rubric version {version}",
  "authoring.calibrate.rubricChanged": "the rubric is at version {version} now: run it again",
  "authoring.calibrate.cost": "cost {cost}",
  "authoring.calibrate.ready": "Ready: the AI judges like you",
  "authoring.calibrate.sharpen": "Sharpen the level descriptions where it differs",
  "authoring.calibrate.run": "Run calibration",
  "authoring.calibrate.starting": "Starting…",
  "authoring.calibrate.needBoth": "Add a passing and a failing example first",
  "authoring.calibrate.gaps.caption": "Where the AI’s scores differ from yours",
  "authoring.calibrate.gaps.criterion": "Criterion",
  "authoring.calibrate.gaps.difference": "Average difference to your scores",
  "authoring.calibrate.gaps.compared": "Examples compared",
  "authoring.calibrate.gaps.points.one": "{n} point",
  "authoring.calibrate.gaps.points.other": "{n} points",
  "authoring.calibrate.examples": "Examples ({n})",
  "authoring.calibrate.empty.title": "No examples yet",
  "authoring.calibrate.empty.body":
    "Two to six examples are enough to see whether the AI applies your rubric the way you would.",
  "authoring.calibrate.you.pass": "You: pass",
  "authoring.calibrate.you.fail": "You: not pass",
  "authoring.calibrate.ai.pass": "AI: pass ({percent} %)",
  "authoring.calibrate.ai.fail": "AI: not pass ({percent} %)",
  "authoring.calibrate.aiScore": "{criterion}: AI {score}/{max}",
  "authoring.calibrate.yourScore": "you {score}",
  "authoring.calibrate.aiSummary": "“{summary}”",
  "authoring.calibrate.remove": "Remove example",
  "authoring.calibrate.removeConfirm": "Remove this example?",
  // The English must match what the calibration job stores when it fails
  // (src/server/review/calibration.ts): the calibrate page finds the key by it.

  // Add an example (calibration exemplar)
  "authoring.exemplar.heading": "Add an example",
  "authoring.exemplar.intro":
    "Real work you have seen, or work you wrote to show the edge of passing. Include at least one you would pass and one you would not.",
  "authoring.exemplar.titleLabel": "Title",
  "authoring.exemplar.titlePlaceholder": "e.g. Strong brief from the pilot",
  "authoring.exemplar.content": "The work",
  "authoring.exemplar.judgement": "Your judgement",
  "authoring.exemplar.pass": "I would pass it",
  "authoring.exemplar.fail": "I would not pass it",
  "authoring.exemplar.scores": "Your scores per criterion (optional, shows where the AI differs)",
  "authoring.exemplar.notScored": "Not scored",
  "authoring.exemplar.notes": "Why",
  "authoring.exemplar.add": "Add example",
  "authoring.exemplar.tooMany": "Keep it to {max} examples; remove one first.",
  "authoring.exemplar.contentMissing": "Paste or upload the example's text.",
  "authoring.exemplar.expectedMissing": "Say whether you would pass it.",
  "authoring.exemplar.added": "Example added.",

  // Outcome page of a course without work, or without an assignment yet
  "authoring.outcome.missing.title": "No assignment yet",
  "authoring.outcome.missing.body":
    "This course was set up without one, for example from the academy's configuration. Add it with a starter rubric, then describe what learners build.",
  "authoring.outcome.missing.add": "Add the assignment",
  "authoring.outcome.prepare.title": "Prepare the work",
  "authoring.outcome.prepare.body":
    "This course ends with the final test alone. To end it with real work too, set up the assignment and rubric here first; learners see nothing of it until you choose it in Details.",
  "authoring.outcome.notUsed.title": "Learners do not hand in work",
  "authoring.outcome.notUsed.body":
    "The course ends with the final test only. The assignment and the rubric are kept in case you choose work again in Details.",
} as const;

export const de: Record<keyof typeof en, string> = {
  "authoring.outcome.title": "Ergebnis und Bewertungsraster",
  "authoring.outcome.created.title": "Kurs als Entwurf angelegt",
  "authoring.outcome.created.body":
    "Er startet mit einem allgemeinen Bewertungsraster. Pass die Kriterien an dein Arbeitsergebnis an und füge dann Lektionen hinzu, die sie vermitteln.",
  "authoring.outcome.build.title": "1. Was Lernende bauen",
  "authoring.outcome.build.body":
    "Lernende sehen das als „{artifact}“. Der Name steht auf der Abschlussbescheinigung.",
  "authoring.outcome.artifactName": "Name der Arbeit",
  "authoring.outcome.prompt": "Aufgabe",
  "authoring.outcome.promptHint":
    "Was abzugeben ist, welche Teile es braucht und wie lang es sein soll.",
  "authoring.outcome.handIn.title": "2. Wie Lernende es abgeben",
  "authoring.outcome.handIn.body":
    "Wähle mindestens eine Möglichkeit. Die KI-Bewertung liest Text, PDFs, Bilder (per Bilderkennung), Formularfelder und den Link.",
  "authoring.outcome.handIn.text": "Geschriebener Text",
  "authoring.outcome.handIn.textBody": "Getippt, eingefügt oder als Markdown-Datei.",
  "authoring.outcome.handIn.pdf": "Ein PDF",
  "authoring.outcome.handIn.pdfBody": "Ein Dokument, Folien oder eine einseitige Übersicht.",
  "authoring.outcome.handIn.image": "Bilder",
  "authoring.outcome.handIn.imageBody": "Screenshots, Fotos eines Whiteboards.",
  "authoring.outcome.handIn.url": "Ein Link",
  "authoring.outcome.handIn.urlBody": "Ein Board, Dokument oder Prototyp.",
  "authoring.outcome.handIn.form": "Ein vorgegebenes Formular",
  "authoring.outcome.handIn.formBody": "Benannte Felder, bewertet als strukturierte Daten.",
  "authoring.outcome.formSchema": "Formularfelder (JSON-Schema)",
  "authoring.outcome.formSchemaHint":
    "Ein Objekt mit Textfeldern: title, description, maxLength; Pflichtfelder stehen in „required“.",
  "authoring.outcome.maxMb": "Maximale Dateigröße",
  "authoring.outcome.maxMbHint":
    "Bis zu 5 Dateien pro Versuch. Fotos werden ohne Standortdaten gespeichert.",
  "authoring.outcome.rubric.title": "3. Bewertungsraster",
  "authoring.outcome.rubric.body":
    "Was Prüfer:innen bewerten. Bestanden oder nicht ergibt sich aus den Punkten und wird nie von der KI übernommen. Eine Änderung am Bewertungsraster erzeugt eine neue Version; frühere Bewertungen behalten ihre.",
  "authoring.outcome.appliesToNew": "Gespeicherte Änderungen gelten für neue Abgaben.",
  "authoring.outcome.save": "Ergebnis und Bewertungsraster speichern",

  "authoring.draft.title": "Bewertungsraster mit KI entwerfen",
  "authoring.draft.intro":
    "Nutzt das Ergebnis oben und idealerweise ein Beispiel guter Arbeit. Du prüfst den Entwurf, bevor etwas gespeichert wird.",
  "authoring.draft.example": "Beispiel guter Arbeit (optional)",
  "authoring.draft.examplePlaceholder":
    "Füge eine fertige Arbeit ein, die du ohne Zögern bestehen lassen würdest.",
  "authoring.draft.keepExample": "Das Beispiel für die Kalibrierung behalten (als bestanden)",
  "authoring.draft.run": "Bewertungsraster entwerfen",
  "authoring.draft.drafting": "Wird entworfen…",
  "authoring.draft.close": "Schließen",
  "authoring.draft.replaceConfirm":
    "Lektionen verweisen auf die aktuellen Kriterien. Ein neues Bewertungsraster ersetzt sie, und diese Lektionen verlieren ihre Verknüpfung in der Abdeckungsübersicht, bis du wieder Kriterien auswählst. Trotzdem entwerfen?",
  "authoring.draft.ready":
    "Der Entwurf steht unten. Lies jedes Kriterium, ändere, was nicht passt, und speichere dann.",
  "authoring.draft.noGateway":
    "Zum Entwerfen braucht es das KI-Gateway (LLM_BASE_URL). Schreib das Bewertungsraster stattdessen unten selbst.",
  "authoring.draft.rateLimited":
    "Zu viele Entwürfe in dieser Stunde. Versuch es später noch einmal.",
  "authoring.draft.unusable": "Der Entwurf ist nicht brauchbar geworden. Versuch es noch einmal.",
  "authoring.draft.noAnswer":
    "Das KI-Gateway hat nicht geantwortet. Versuch es gleich noch einmal.",

  "authoring.rubric.passAt": "Bestanden ab",
  "authoring.rubric.passAtHint": "Bezogen auf die gewichtete Punktzahl über alle Kriterien.",
  "authoring.rubric.whoDecides": "Wer entscheidet",
  "authoring.rubric.mode.ai_auto.title": "KI entscheidet, Menschen prüfen Stichproben",
  "authoring.rubric.mode.ai_auto.body":
    "Ergebnisse erreichen Lernende sofort. Die ersten bestandenen Abgaben und danach eine Stichprobe kommen in die offenen Bewertungen; Ergebnisse nahe der Bestehensgrenze und wiederholtes Nichtbestehen warten auf einen Menschen.",
  "authoring.rubric.mode.ai_then_human.title": "KI entwirft, ein Mensch bestätigt",
  "authoring.rubric.mode.ai_then_human.body":
    "Jedes Ergebnis wartet in den offenen Bewertungen, die Punkte der KI sind schon eingetragen.",
  "authoring.rubric.mode.human_only.title": "Nur Menschen",
  "authoring.rubric.mode.human_only.body":
    "Keine KI-Bewertung. Jede Abgabe kommt in die offenen Bewertungen.",
  "authoring.rubric.criterion": "Kriterium {n}",
  "authoring.rubric.weight": "Gewichtung",
  "authoring.rubric.share": "{share} % der Punktzahl",
  "authoring.rubric.removeCriterion": "Kriterium entfernen",
  "authoring.rubric.removeCriterionLabel": "Kriterium {n} entfernen",
  "authoring.rubric.removeCriterionConfirm":
    "Dieses Kriterium entfernen? Lektionen, die es vermitteln, verlieren die Verknüpfung; frühere Bewertungen behalten ihre Punkte.",
  "authoring.rubric.name": "Name",
  "authoring.rubric.namePlaceholder": "z. B. Belege",
  "authoring.rubric.looksFor": "Worauf Prüfer:innen achten",
  "authoring.rubric.levels": "Punktestufen",
  "authoring.rubric.score": "Punkte",
  "authoring.rubric.levelLabel": "Punktzahl {score}, {language}",
  "authoring.rubric.addLevel": "Stufe hinzufügen",
  "authoring.rubric.removeTopLevel": "Oberste Stufe entfernen",
  "authoring.rubric.addCriterion": "Kriterium hinzufügen",
  "authoring.rubric.spotChecks": "Stichproben und Eskalation",
  "authoring.rubric.spotChecksBody":
    "Die Standardwerte folgen der Empfehlung: Die ersten 20 Abgaben, die die KI bestehen lässt, werden alle geprüft, danach eine Stichprobe. Ändere sie, sobald du Daten hast.",
  "authoring.rubric.initialChecks": "Jede bestandene Abgabe prüfen bis Nr.",
  "authoring.rubric.spotCheckRate": "Danach Stichproben (%)",
  "authoring.rubric.agreementAt": "Sobald KI und Menschen übereinstimmen (%)",
  "authoring.rubric.reducedRate": "… Stichproben senken auf (%)",
  "authoring.rubric.nearThreshold": "Ergebnisse bis ± Punkte um die Bestehensgrenze zurückhalten",
  "authoring.rubric.failedAttempt": "Nicht bestandene Ergebnisse zurückhalten ab Versuch Nr.",
  "authoring.rubric.off": "Aus",

  "authoring.calibrate.title": "Kalibrieren",
  "authoring.calibrate.heading": "Bewertung kalibrieren",
  "authoring.calibrate.intro":
    "Bevor Lernende abgeben, prüf, ob die KI so urteilt wie du. Füge ein paar Beispiele hinzu, die du bestehen lassen würdest, und ein paar, die du nicht bestehen lassen würdest. Dann lass die KI sie bewerten. Wo sie anders urteilt, schärfe das {rubric}. Bei echten Abgaben sieht die KI außerdem bis zu zwei Beispiele jeder Art.",
  "authoring.calibrate.introRubric": "Bewertungsraster",
  "authoring.calibrate.noGateway.title": "Das KI-Gateway ist nicht eingerichtet",
  "authoring.calibrate.noGateway.body":
    "Die Kalibrierung nutzt die KI-Bewertung, und die braucht LLM_BASE_URL auf dem Server.",
  "authoring.calibrate.needExamples":
    "Füge mindestens ein Beispiel hinzu, das du bestehen lassen würdest, und eines, das du nicht bestehen lassen würdest.",
  "authoring.calibrate.rateLimited":
    "Zu viele Durchläufe in dieser Stunde. Versuch es später noch einmal.",
  "authoring.calibrate.running": "Die KI bewertet deine Beispiele…",
  "authoring.calibrate.agreement":
    "Die KI war bei {agreed} von {total} Beispielen deiner Meinung ({percent} %)",
  "authoring.calibrate.notYet": "Noch nicht kalibriert",
  "authoring.calibrate.rubricVersion": "Mit Version {version} des Bewertungsrasters",
  "authoring.calibrate.rubricChanged": "inzwischen gilt Version {version}: Kalibriere noch einmal",
  "authoring.calibrate.cost": "Kosten: {cost}",
  "authoring.calibrate.ready": "Bereit: Die KI urteilt wie du",
  "authoring.calibrate.sharpen": "Schärfe die Stufenbeschreibungen, wo sie abweicht",
  "authoring.calibrate.run": "Kalibrierung starten",
  "authoring.calibrate.starting": "Wird gestartet…",
  "authoring.calibrate.needBoth":
    "Füge zuerst ein Beispiel hinzu, das besteht, und eines, das nicht besteht",
  "authoring.calibrate.gaps.caption": "Wo die Punkte der KI von deinen abweichen",
  "authoring.calibrate.gaps.criterion": "Kriterium",
  "authoring.calibrate.gaps.difference": "Durchschnittliche Abweichung von deinen Punkten",
  "authoring.calibrate.gaps.compared": "Verglichene Beispiele",
  "authoring.calibrate.gaps.points.one": "{n} Punkt",
  "authoring.calibrate.gaps.points.other": "{n} Punkte",
  "authoring.calibrate.examples": "Beispiele ({n})",
  "authoring.calibrate.empty.title": "Noch keine Beispiele",
  "authoring.calibrate.empty.body":
    "Zwei bis sechs Beispiele reichen, um zu sehen, ob die KI dein Bewertungsraster so anwendet wie du.",
  "authoring.calibrate.you.pass": "Du: bestanden",
  "authoring.calibrate.you.fail": "Du: nicht bestanden",
  "authoring.calibrate.ai.pass": "KI: bestanden ({percent} %)",
  "authoring.calibrate.ai.fail": "KI: nicht bestanden ({percent} %)",
  "authoring.calibrate.aiScore": "{criterion}: KI {score}/{max}",
  "authoring.calibrate.yourScore": "du {score}",
  "authoring.calibrate.aiSummary": "„{summary}“",
  "authoring.calibrate.remove": "Beispiel entfernen",
  "authoring.calibrate.removeConfirm": "Dieses Beispiel entfernen?",

  "authoring.exemplar.heading": "Beispiel hinzufügen",
  "authoring.exemplar.intro":
    "Echte Arbeiten, die du gesehen hast, oder selbst geschriebene, die die Grenze zum Bestehen zeigen. Nimm mindestens eine dazu, die du bestehen lassen würdest, und eine, die du nicht bestehen lassen würdest.",
  "authoring.exemplar.titleLabel": "Titel",
  "authoring.exemplar.titlePlaceholder": "z. B. Starkes Briefing aus dem Pilotprojekt",
  "authoring.exemplar.content": "Die Arbeit",
  "authoring.exemplar.judgement": "Dein Urteil",
  "authoring.exemplar.pass": "Ich würde sie bestehen lassen",
  "authoring.exemplar.fail": "Ich würde sie nicht bestehen lassen",
  "authoring.exemplar.scores": "Deine Punkte je Kriterium (optional, zeigt, wo die KI abweicht)",
  "authoring.exemplar.notScored": "Nicht bewertet",
  "authoring.exemplar.notes": "Begründung",
  "authoring.exemplar.add": "Beispiel hinzufügen",
  "authoring.exemplar.tooMany": "Höchstens {max} Beispiele: Entferne zuerst eines.",
  "authoring.exemplar.contentMissing": "Füge den Text des Beispiels ein oder lade ihn hoch.",
  "authoring.exemplar.expectedMissing": "Gib an, ob du sie bestehen lassen würdest.",
  "authoring.exemplar.added": "Beispiel hinzugefügt.",

  "authoring.outcome.missing.title": "Noch keine Aufgabe",
  "authoring.outcome.missing.body":
    "Dieser Kurs wurde ohne angelegt, zum Beispiel über die Konfiguration der Akademie. Leg sie mit einer Vorlage für das Bewertungsraster an und beschreib dann, was Lernende bauen.",
  "authoring.outcome.missing.add": "Aufgabe anlegen",
  "authoring.outcome.prepare.title": "Die Arbeit vorbereiten",
  "authoring.outcome.prepare.body":
    "Dieser Kurs endet nur mit dem Abschlusstest. Soll er auch mit einer echten Arbeit enden, richte Aufgabe und Bewertungsraster zuerst hier ein; Lernende sehen davon nichts, bis du es in den Details wählst.",
  "authoring.outcome.notUsed.title": "Lernende reichen keine Arbeit ein",
  "authoring.outcome.notUsed.body":
    "Der Kurs endet nur mit dem Abschlusstest. Aufgabe und Bewertungsraster bleiben erhalten, falls du in den Details wieder eine Arbeit wählst.",
};
