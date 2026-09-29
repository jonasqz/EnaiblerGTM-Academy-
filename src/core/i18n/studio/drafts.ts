/**
 * Studio strings: AI drafts from sources (webinar brief §2.1) and the live
 * Q&A as a source (see ./index.ts). Keys start with "drafts.".
 */
export const en = {
  // A live Q&A as a source
  "drafts.qa.hint":
    "Paste the questions from your webinar's Q&A, or load the tool's export (CSV or text). Answers are optional: questions nobody answered can be answered from your other sources.",
  "drafts.qa.text": "Questions and answers",
  "drafts.qa.placeholder":
    "Q: How often should the first reminder go out?\nA: Three days after the due date.\n\nQ: Do I charge a late fee?",
  "drafts.qa.load": "Load an export file",
  "drafts.qa.privacy":
    "Only the questions and answers are kept. Names, e-mail addresses and times in the export are left out.",
  "drafts.qa.tooLarge": "The file is larger than 1 MB. Paste the questions instead.",
  "drafts.qa.empty":
    "No questions found. Put each question on its own line, ending with “?”, or start it with “Q:”.",
  "drafts.qa.defaultTitle": "Live Q&A",
  "drafts.qa.added.one": "Q&A added with {n} question.",
  "drafts.qa.added.other": "Q&A added with {n} questions.",
  "drafts.qa.count.one": "{n} question",
  "drafts.qa.count.other": "{n} questions",
  "drafts.qa.questions": "Questions from the live Q&A",
  "drafts.qa.noAnswer": "Not answered live",

  // FAQ lesson from a Q&A
  "drafts.faq.title": "Draft an FAQ lesson",
  "drafts.faq.intro":
    "Merges questions that ask the same thing and answers them from the live answers or your other sources. You edit the lesson before learners see it.",
  "drafts.faq.introNoAi":
    "Turns the questions answered live into a lesson, as they were asked. You edit it before learners see it.",
  "drafts.faq.language": "Language of the lesson",
  "drafts.faq.run": "Draft FAQ lesson",
  "drafts.faq.running": "Drafting…",
  "drafts.faq.done": "FAQ lesson added to the course.",
  "drafts.faq.open": "Open the lesson",
  "drafts.faq.left.one": "{n} question had no answer and was left out:",
  "drafts.faq.left.other": "{n} questions had no answer and were left out:",
  "drafts.faq.fallback": "Written without the AI: {reason}",

  // Final-test questions
  "drafts.quiz.title": "Draft questions with AI",
  "drafts.quiz.intro":
    "Drafts questions in every course language from your sources and lessons, each with an explanation and where it comes from. They are added below, unsaved: check every one, then save.",
  "drafts.quiz.count": "How many",
  "drafts.quiz.run": "Draft questions",
  "drafts.quiz.running": "Drafting…",
  "drafts.quiz.ready.one": "{n} question drafted and added below. Check it, then save.",
  "drafts.quiz.ready.other": "{n} questions drafted and added below. Check them, then save.",
  "drafts.quiz.full": "The test already holds as many questions as it can.",

  // Assignment and rubric from the sources
  "drafts.assignment.run": "Suggest from your sources",
  "drafts.assignment.running": "Drafting…",
  "drafts.assignment.intro":
    "Proposes what learners build, the assignment and a rubric whose criteria your sources teach.",
  "drafts.assignment.replaceConfirm":
    "This puts the suggestion in place of the name, the assignment and the rubric. Nothing is saved until you save. Go ahead?",
  "drafts.assignment.ready":
    "Suggestion ready: name and assignment here, the rubric below. Read it all, change what does not fit, then save.",

  // Which criteria the sources teach
  "drafts.coverage.title": "What your sources teach",
  "drafts.coverage.intro":
    "Which criteria your sources explain well enough to learn from, lessons or not.",
  "drafts.coverage.run": "Check the sources",
  "drafts.coverage.rerun": "Check again",
  "drafts.coverage.running": "Checking…",
  "drafts.coverage.checked": "Checked {date}.",
  "drafts.coverage.outdated": "The rubric or the sources changed since {date}: check again.",
  "drafts.coverage.none": "Not covered by any source",
  "drafts.coverage.sources": "Sources: {sections}",
  "drafts.coverage.noSources": "Add a source first; this check reads the sources that are ready.",

  // Knowledge-check questions
  "drafts.check.run": "Draft questions from this lesson",
  "drafts.check.running": "Drafting…",
  "drafts.check.ready.one": "{n} question drafted and added below. Saving the lesson keeps it.",
  "drafts.check.ready.other":
    "{n} questions drafted and added below. Saving the lesson keeps them.",

  // Shared
  "drafts.badge": "AI draft, not saved yet",
  "drafts.allowance":
    "Your academy's AI allowance for this month is used up, so there is no draft until {date}.",
  "drafts.noGateway": "Drafting needs the AI gateway (LLM_BASE_URL).",
  "drafts.rateLimited": "Too many drafts this hour. Try again later.",
} as const;

export const de: Record<keyof typeof en, string> = {
  "drafts.qa.hint":
    "Füge die Fragen aus der Fragerunde deines Webinars ein oder lade den Export des Tools (CSV oder Text). Antworten sind optional: Unbeantwortete Fragen lassen sich aus deinen anderen Quellen beantworten.",
  "drafts.qa.text": "Fragen und Antworten",
  "drafts.qa.placeholder":
    "F: Wann sollte die erste Erinnerung rausgehen?\nA: Drei Tage nach Fälligkeit.\n\nF: Berechne ich eine Mahngebühr?",
  "drafts.qa.load": "Exportdatei laden",
  "drafts.qa.privacy":
    "Gespeichert werden nur Fragen und Antworten. Namen, E-Mail-Adressen und Uhrzeiten aus dem Export fallen weg.",
  "drafts.qa.tooLarge": "Die Datei ist größer als 1 MB. Füge die Fragen stattdessen ein.",
  "drafts.qa.empty":
    "Keine Fragen gefunden. Schreib jede Frage in eine eigene Zeile mit „?“ am Ende oder beginne sie mit „F:“.",
  "drafts.qa.defaultTitle": "Live-Fragerunde",
  "drafts.qa.added.one": "Fragerunde mit {n} Frage hinzugefügt.",
  "drafts.qa.added.other": "Fragerunde mit {n} Fragen hinzugefügt.",
  "drafts.qa.count.one": "{n} Frage",
  "drafts.qa.count.other": "{n} Fragen",
  "drafts.qa.questions": "Fragen aus der Live-Fragerunde",
  "drafts.qa.noAnswer": "Live nicht beantwortet",

  "drafts.faq.title": "FAQ-Lektion entwerfen",
  "drafts.faq.intro":
    "Fasst Fragen zusammen, die dasselbe meinen, und beantwortet sie aus den Live-Antworten oder deinen anderen Quellen. Du bearbeitest die Lektion, bevor Lernende sie sehen.",
  "drafts.faq.introNoAi":
    "Macht aus den live beantworteten Fragen eine Lektion, so wie sie gestellt wurden. Du bearbeitest sie, bevor Lernende sie sehen.",
  "drafts.faq.language": "Sprache der Lektion",
  "drafts.faq.run": "FAQ-Lektion entwerfen",
  "drafts.faq.running": "Wird entworfen…",
  "drafts.faq.done": "FAQ-Lektion zum Kurs hinzugefügt.",
  "drafts.faq.open": "Lektion öffnen",
  "drafts.faq.left.one": "{n} Frage hatte keine Antwort und wurde weggelassen:",
  "drafts.faq.left.other": "{n} Fragen hatten keine Antwort und wurden weggelassen:",
  "drafts.faq.fallback": "Ohne KI geschrieben: {reason}",

  "drafts.quiz.title": "Fragen mit KI entwerfen",
  "drafts.quiz.intro":
    "Entwirft Fragen in jeder Kurssprache aus deinen Quellen und Lektionen, jede mit Erklärung und Herkunft. Sie kommen ungespeichert unten dazu: Prüf jede einzelne und speichere dann.",
  "drafts.quiz.count": "Wie viele",
  "drafts.quiz.run": "Fragen entwerfen",
  "drafts.quiz.running": "Wird entworfen…",
  "drafts.quiz.ready.one": "{n} Frage entworfen und unten ergänzt. Prüf sie und speichere dann.",
  "drafts.quiz.ready.other": "{n} Fragen entworfen und unten ergänzt. Prüf sie und speichere dann.",
  "drafts.quiz.full": "Der Test hat schon so viele Fragen, wie er fassen kann.",

  "drafts.assignment.run": "Aus deinen Quellen vorschlagen",
  "drafts.assignment.running": "Wird entworfen…",
  "drafts.assignment.intro":
    "Schlägt vor, was Lernende bauen, die Aufgabe und ein Bewertungsraster mit Kriterien, die deine Quellen vermitteln.",
  "drafts.assignment.replaceConfirm":
    "Der Vorschlag ersetzt Name, Aufgabe und Bewertungsraster. Gespeichert wird erst, wenn du speicherst. Weiter?",
  "drafts.assignment.ready":
    "Vorschlag steht: Name und Aufgabe hier, das Bewertungsraster unten. Lies alles, ändere, was nicht passt, und speichere dann.",

  "drafts.coverage.title": "Was deine Quellen vermitteln",
  "drafts.coverage.intro":
    "Welche Kriterien deine Quellen so erklären, dass man sie daraus lernen kann, mit oder ohne Lektionen.",
  "drafts.coverage.run": "Quellen prüfen",
  "drafts.coverage.rerun": "Noch einmal prüfen",
  "drafts.coverage.running": "Wird geprüft…",
  "drafts.coverage.checked": "Geprüft am {date}.",
  "drafts.coverage.outdated":
    "Bewertungsraster oder Quellen haben sich seit {date} geändert: Prüf noch einmal.",
  "drafts.coverage.none": "Von keiner Quelle abgedeckt",
  "drafts.coverage.sources": "Quellen: {sections}",
  "drafts.coverage.noSources":
    "Füge zuerst eine Quelle hinzu; die Prüfung liest die Quellen, die fertig gelesen sind.",

  "drafts.check.run": "Fragen aus dieser Lektion entwerfen",
  "drafts.check.running": "Wird entworfen…",
  "drafts.check.ready.one":
    "{n} Frage entworfen und unten ergänzt. Mit dem Speichern der Lektion bleibt sie.",
  "drafts.check.ready.other":
    "{n} Fragen entworfen und unten ergänzt. Mit dem Speichern der Lektion bleiben sie.",

  "drafts.badge": "KI-Entwurf, noch nicht gespeichert",
  "drafts.allowance":
    "Das KI-Kontingent deiner Akademie für diesen Monat ist aufgebraucht, deshalb gibt es bis zum {date} keinen Entwurf.",
  "drafts.noGateway": "Zum Entwerfen braucht es das KI-Gateway (LLM_BASE_URL).",
  "drafts.rateLimited": "Zu viele Entwürfe in dieser Stunde. Versuch es später noch einmal.",
};
