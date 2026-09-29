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
  "drafts.faq.rateLimited": "Too many drafts this hour. Try again later.",

  // Shared
  "drafts.allowance":
    "Your academy's AI allowance for this month is used up, so there is no draft until {date}.",
  "drafts.noGateway": "Drafting needs the AI gateway (LLM_BASE_URL).",
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
  "drafts.faq.rateLimited": "Zu viele Entwürfe in dieser Stunde. Versuch es später noch einmal.",

  "drafts.allowance":
    "Das KI-Kontingent deiner Akademie für diesen Monat ist aufgebraucht, deshalb gibt es bis zum {date} keinen Entwurf.",
  "drafts.noGateway": "Zum Entwerfen braucht es das KI-Gateway (LLM_BASE_URL).",
};
