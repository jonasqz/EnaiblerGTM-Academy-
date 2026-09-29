/**
 * Webinar series as courses (webinar brief §2.6, §2.7): session lessons, what
 * the certificate asks of the sessions, the homework deadline and whether
 * late hand-ins are taken, and the sessions' numbers on the course page.
 */
export const en = {
  // A lesson that is a live session
  "series.lesson.label": "Live session",
  "series.lesson.none": "None: an ordinary lesson",
  "series.lesson.hint":
    "Make this lesson one of your academy's webinars. Everyone who starts the course is registered for it, and the lesson is done once they attended or watched the recording. The text below prepares them.",
  "series.lesson.option": "{title} · {date}",
  "series.lesson.optionDraft": "{title} · {date} (draft)",
  "series.lesson.optionCancelled": "{title} · {date} (cancelled)",
  "series.lesson.gone": "A webinar that no longer exists",
  "series.lesson.manage": "Manage webinars",
  "series.lesson.refused":
    "That webinar can't be this lesson's session: it belongs to another course, or another lesson is its session already.",
  "series.lesson.previewNote":
    "Live session: {title}. Learners see its date, their seat, the link to join and later the recording here.",
  "series.lesson.badge": "Session",

  // What the certificate asks of the sessions (next to how the course ends)
  "series.rule.title": "Live sessions",
  "series.rule.intro.one": "This course has {n} live session. What does the certificate ask of it?",
  "series.rule.intro.other":
    "This course has {n} live sessions. What does the certificate ask of them?",
  "series.rule.none": "Nothing",
  "series.rule.none.body":
    "The sessions are there to learn from. The certificate rests on the rest.",
  "series.rule.attended": "Every session, live",
  "series.rule.attended.body":
    "The check-in code, your attendance list or the tool's report counts.",
  "series.rule.attended_or_watched": "Every session, live or as recording",
  "series.rule.attended_or_watched.body":
    "Missed one? Watching at least {percent} % of its recording within the catch-up window counts too.",
  "series.rule.catchUp": "Catch-up window (days after each session)",
  "series.rule.catchUpHint": "Leave it empty for no limit.",
  "series.rule.catchUpInvalid":
    "Enter the catch-up window in whole days, from 1 to 365, or leave it empty.",
  "series.rule.choose": "Choose what the certificate asks of the sessions.",

  // The course page in the Studio
  "series.sessions.title": "Live sessions",
  "series.sessions.intro":
    "Learners of the course are registered for every session. Attending counts from the check-in, your list or the tool's report; watching from the recording.",
  "series.sessions.session": "Session",
  "series.sessions.registered": "Registered",
  "series.sessions.attended": "Attended",
  "series.sessions.watched": "Watched",
  "series.sessions.draft": "Draft",
  "series.sessions.cancelled": "Cancelled",

  // The homework deadline (assignment editor) and late hand-ins (settings)
  "series.deadline.title": "Deadline",
  "series.deadline.date": "Date",
  "series.deadline.time": "Time",
  "series.deadline.hint":
    "Optional. In {zone} time. Two days before, learners who haven't handed in yet get a reminder.",
  "series.deadline.accepted": "Your academy accepts hand-ins after a deadline.",
  "series.deadline.refused":
    "Your academy refuses first hand-ins after a deadline. Revising work handed in on time stays possible.",
  "series.deadline.settings": "Change this in Settings",
  "series.deadline.invalid": "Enter both a date and a time for the deadline, or neither.",
  "series.settings.title": "Homework",
  "series.settings.late": "Hand-ins after a deadline",
  "series.settings.late.accepted": "Accept them",
  "series.settings.late.acceptedHint": "Learners can still hand in; the work is reviewed as usual.",
  "series.settings.late.refused": "Refuse them",
  "series.settings.late.refusedHint":
    "After the deadline the assignment takes no first hand-in. Revising work handed in on time stays possible.",
} as const;

export const de: Record<keyof typeof en, string> = {
  "series.lesson.label": "Live-Session",
  "series.lesson.none": "Keine: eine normale Lektion",
  "series.lesson.hint":
    "Mach diese Lektion zu einem Webinar deiner Akademie. Wer den Kurs startet, ist dafür angemeldet, und die Lektion ist erledigt, sobald jemand teilgenommen oder die Aufzeichnung angesehen hat. Der Text darunter bereitet darauf vor.",
  "series.lesson.option": "{title} · {date}",
  "series.lesson.optionDraft": "{title} · {date} (Entwurf)",
  "series.lesson.optionCancelled": "{title} · {date} (abgesagt)",
  "series.lesson.gone": "Ein Webinar, das es nicht mehr gibt",
  "series.lesson.manage": "Webinare verwalten",
  "series.lesson.refused":
    "Dieses Webinar kann nicht die Session dieser Lektion sein: Es gehört zu einem anderen Kurs, oder eine andere Lektion ist schon seine Session.",
  "series.lesson.previewNote":
    "Live-Session: {title}. Lernende sehen hier den Termin, ihren Platz, den Link zur Teilnahme und später die Aufzeichnung.",
  "series.lesson.badge": "Session",

  "series.rule.title": "Live-Sessions",
  "series.rule.intro.one":
    "Dieser Kurs hat {n} Live-Session. Was verlangt die Bescheinigung davon?",
  "series.rule.intro.other":
    "Dieser Kurs hat {n} Live-Sessions. Was verlangt die Bescheinigung davon?",
  "series.rule.none": "Nichts",
  "series.rule.none.body":
    "Die Sessions sind zum Lernen da. Die Bescheinigung beruht auf dem Rest.",
  "series.rule.attended": "Jede Session, live",
  "series.rule.attended.body":
    "Es zählen der Check-in-Code, deine Teilnahmeliste oder der Bericht des Tools.",
  "series.rule.attended_or_watched": "Jede Session, live oder als Aufzeichnung",
  "series.rule.attended_or_watched.body":
    "Eine verpasst? Dann zählt auch, mindestens {percent} % der Aufzeichnung im Nachholzeitraum anzusehen.",
  "series.rule.catchUp": "Nachholzeitraum (Tage nach jeder Session)",
  "series.rule.catchUpHint": "Leer lassen für keine Begrenzung.",
  "series.rule.catchUpInvalid":
    "Gib den Nachholzeitraum in ganzen Tagen an, von 1 bis 365, oder lass ihn leer.",
  "series.rule.choose": "Wähle, was die Bescheinigung von den Sessions verlangt.",

  "series.sessions.title": "Live-Sessions",
  "series.sessions.intro":
    "Lernende des Kurses sind für jede Session angemeldet. Die Teilnahme zählt über den Check-in, deine Liste oder den Bericht des Tools, das Ansehen über die Aufzeichnung.",
  "series.sessions.session": "Session",
  "series.sessions.registered": "Angemeldet",
  "series.sessions.attended": "Teilgenommen",
  "series.sessions.watched": "Angesehen",
  "series.sessions.draft": "Entwurf",
  "series.sessions.cancelled": "Abgesagt",

  "series.deadline.title": "Frist",
  "series.deadline.date": "Datum",
  "series.deadline.time": "Uhrzeit",
  "series.deadline.hint":
    "Optional. In der Zeitzone {zone}. Zwei Tage vorher bekommen alle, die noch nicht abgegeben haben, eine Erinnerung.",
  "series.deadline.accepted": "Deine Akademie nimmt Abgaben nach einer Frist noch an.",
  "series.deadline.refused":
    "Deine Akademie nimmt nach einer Frist keine erste Abgabe mehr an. Pünktlich abgegebene Arbeiten lassen sich weiter überarbeiten.",
  "series.deadline.settings": "In den Einstellungen ändern",
  "series.deadline.invalid": "Gib für die Frist Datum und Uhrzeit an, oder keins von beidem.",
  "series.settings.title": "Aufgaben",
  "series.settings.late": "Abgaben nach einer Frist",
  "series.settings.late.accepted": "Annehmen",
  "series.settings.late.acceptedHint":
    "Lernende können noch abgeben; die Arbeit wird wie gewohnt bewertet.",
  "series.settings.late.refused": "Ablehnen",
  "series.settings.late.refusedHint":
    "Nach der Frist nimmt die Aufgabe keine erste Abgabe mehr an. Pünktlich abgegebene Arbeiten lassen sich weiter überarbeiten.",
};
