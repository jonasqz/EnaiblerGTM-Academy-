/** Studio strings: media library (see ./index.ts). Keys start with "media.". */
export const en = {
  "media.nav": "Videos",
  "media.title": "Videos",
  "media.description":
    "Re-lives and lesson videos. Upload a recording, turn a course recording into a video, or add one you host on YouTube or Vimeo; lessons show them with your academy's player.",

  // Adding a video
  "media.add.title": "Add a video",
  "media.add.kind": "What to add",
  "media.add.kind.upload": "Upload",
  "media.add.kind.recording": "Course recording",
  "media.add.kind.embed": "YouTube or Vimeo",
  "media.add.hint.upload":
    "MP4, MOV or WebM, up to 4 GB. We prepare it for every screen size and write captions from what is said; that takes a few minutes.",
  "media.add.hint.recording":
    "Screen recordings you added to a course as a source. The video keeps their transcript and topics as captions and chapters.",
  "media.add.hint.embed":
    "Paste the link to a video on YouTube or Vimeo. Learners load it only when they click, in privacy-enhanced mode.",
  "media.add.file": "Video file",
  "media.add.choose": "Choose a video",
  "media.add.chosen": "{name}, {size}",
  "media.add.uploading": "Uploading… {percent} %",
  "media.add.titleLabel": "Title",
  "media.add.titlePlaceholder": "The file's name when left empty",
  "media.add.language": "Spoken language",
  "media.add.languageHint": "For the captions.",
  "media.add.recording": "Recording",
  "media.add.recordingOption": "{title} · {course}",
  "media.add.recordingPending": "{title} · {course} (still being transcribed)",
  "media.add.noRecordings":
    "No course has a screen recording yet. Add one under a course's sources, then come back.",
  "media.add.url": "Link to the video",
  "media.add.submit.upload": "Upload and prepare",
  "media.add.submit.recording": "Make it a video",
  "media.add.submit.embed": "Add video",
  "media.add.added": "Added. The video is being prepared; this page updates when it's ready.",
  "media.add.addedEmbed": "Added. You can show it in lessons now.",

  "media.error.chooseFile": "Choose a video file first.",
  "media.error.storageQuota":
    "There's no room left in your academy's video storage for this video. Delete videos you no longer need, or ask enaibler for more room.",
  "media.error.tooLarge": "“{name}” is larger than 4 GB.",
  "media.error.type": "“{name}” is not an MP4, MOV or WebM video.",
  "media.error.failed": "“{name}” could not be uploaded. Please try again.",
  "media.error.rateLimited": "Too many uploads in a short time. Please wait a moment.",
  "media.error.invalidUrl": "That is not a link to a video on YouTube or Vimeo.",
  "media.error.notVideo": "That file is not a video.",
  "media.error.inUse": "This upload is already in the library.",
  "media.error.notReady":
    "The recording is still being transcribed. Try again once its transcript is ready.",
  "media.error.notFound": "That recording no longer exists.",
  "media.error.gone": "This video no longer exists.",
  "media.error.chaptersChanged":
    "The chapters changed while you were editing (the transcript arrived). Reload the page and rename them again.",
  // Why preparing a video failed (codes from core/media/access)
  "media.error.code.no_video": "The file has no picture we can read.",
  "media.error.code.source_missing": "The course recording it was made from was deleted.",
  "media.error.code.transcode_failed":
    "Preparing it failed. Upload the video again, or export it in another format.",

  // Storage
  "media.storage.heading": "Video storage",
  "media.storage.used": "{percent} % used",
  "media.storage.meter": "Share of your academy's video storage in use",
  "media.storage.hint":
    "Uploads and the versions we prepare for each screen size count; videos on YouTube or Vimeo don't.",
  "media.storage.warning": "Your video storage is almost full.",
  "media.storage.full":
    "Your video storage is full: new uploads are refused until you delete videos or enaibler gives your academy more room.",

  // The library
  "media.list.heading": "Library",
  "media.list.caption": "Videos of this academy",
  "media.list.empty": "No videos yet",
  "media.list.emptyBody":
    "Upload a webinar recording or add a YouTube video, then show it in a lesson.",
  "media.column.video": "Video",
  "media.column.status": "Status",
  "media.column.length": "Length",
  "media.column.access": "Who can watch",
  "media.column.viewers": "Viewers",
  "media.column.added": "Added",
  "media.kind.upload": "Uploaded",
  "media.kind.recording": "Course recording",
  "media.kind.youtube": "YouTube",
  "media.kind.vimeo": "Vimeo",
  "media.status.processing": "Being prepared",
  "media.status.ready": "Ready",
  "media.status.failed": "Failed",
  "media.access.learners": "Learners",
  "media.access.public": "Public",
  "media.access.registrants": "Webinar registrants",

  // One video
  "media.back": "Videos",
  "media.detail.preview": "Preview",
  "media.detail.previewHint":
    "As learners see it, in your academy's design. Watching it here is not counted.",
  "media.detail.processing": "The video is being prepared",
  "media.detail.processingBody":
    "This takes a few minutes, longer for long recordings. You can leave this page.",
  "media.detail.failed": "The video could not be prepared",
  "media.detail.captions": "Captions and transcript",
  "media.detail.captions.processing": "Captions are being written from what is said.",
  "media.detail.captions.ready":
    "Captions and a searchable transcript in {language}, {lines} lines.",
  "media.detail.captions.none": "This video has no captions.",
  "media.detail.captions.embed": "{provider} shows its own captions in its player.",
  "media.detail.captions.failed": "No captions: {reason}",
  "media.detail.source": "On {provider}",
  "media.detail.details": "Details",
  "media.field.title": "Title",
  "media.field.access": "Who can watch",
  "media.field.access.learners": "Signed-in learners of this academy",
  "media.field.access.learnersHint": "The default. Lessons are for signed-in learners anyway.",
  "media.field.access.registrants": "People registered for its webinar",
  "media.field.access.registrantsHint":
    "Set on the webinar that shows this video as its recording.",
  "media.field.access.registrantsDetached":
    "It's no webinar's recording any more, so only your team can watch it until you choose who may.",
  "media.field.access.public": "Anyone on your academy's site",
  "media.field.access.publicHint":
    "Before you make a recording public, make sure everyone seen or heard in it agreed.",
  "media.field.chapters": "Chapters",
  "media.field.chaptersHint":
    "They start where the topics change. Name them so learners find their way.",
  "media.field.chapter": "Chapter {n} at {time}",
  "media.field.chapterPlaceholder": "Chapter {n}",
  "media.save": "Save",
  "media.saved": "Saved.",

  // Who watched (webinar brief §3: drop-off by minute)
  "media.watch.heading": "Who watched",
  "media.watch.intro":
    "Signed-in learners only: anonymous viewers of public videos are not tracked, and your team is left out.",
  "media.watch.viewers": "Viewers",
  "media.watch.viewersHint": "pressed play",
  "media.watch.watched": "Watched",
  "media.watch.watchedHint": "played at least {percent} % of it",
  "media.watch.average": "Share watched",
  "media.watch.averageHint": "percent of the video, on average",
  "media.retention.heading": "Viewers by minute",
  "media.retention.intro":
    "How many viewers watched at least half of each minute. Where the columns drop, people left.",
  "media.retention.caption": "Viewers per minute of “{title}”",
  "media.retention.axis": "Minutes",
  "media.retention.minute": "Minute {n}",
  "media.retention.viewers.one": "{n} viewer",
  "media.retention.viewers.other": "{n} viewers",
  "media.retention.summary": "{first} in the first minute, {last} in the last.",
  "media.retention.explore": "Use the arrow keys to go through the minutes.",
  "media.retention.table": "Show as a table",
  "media.retention.column.minute": "Minute",
  "media.retention.column.viewers": "Viewers",
  "media.retention.empty": "No learner has watched this video yet.",
  "media.retention.noLength":
    "Drop-off shows once a viewer's player has reported how long the video is.",

  "media.usedIn.heading": "Shown in lessons",
  "media.usedIn.none": "No lesson shows this video yet. Pick it in a lesson's editor.",
  "media.delete": "Delete video",
  "media.deleteConfirm":
    "Delete this video for good? Its files are removed, and lessons that show it will show nothing in its place.",
  "media.deleteConfirmWebinar":
    "Delete this video for good? It's the recording of the webinar “{webinar}”: it comes off the webinar first, and the webinar's page then only says it has ended. Its files are removed, and lessons that show it will show nothing in its place.",
  "media.deleted": "Video deleted.",

  // A webinar's recording: managed on the webinar (server/webinars/recording.ts)
  "media.webinar.heading": "Webinar recording",
  "media.webinar.body":
    "This is the recording of “{webinar}”. Who may watch it is set there: {access}.",
  "media.webinar.link": "Open the webinar's recording settings",

  // The lesson editor's video picker
  "media.lesson.label": "Video",
  "media.lesson.none": "No video",
  "media.lesson.hint": "Shown above the text, with chapters, captions and a transcript.",
  "media.lesson.manage": "Manage videos",
  "media.lesson.pending": "{title} (being prepared)",
  "media.lesson.previewNote": "Video: {title}. It plays in the preview as learner.",

  // Settings → Academy
  "media.settings.heading": "Videos",
  "media.settings.threshold": "A video counts as watched at",
  "media.settings.thresholdHint":
    "The share of a video a learner has to actually play; skipping ahead does not count. Between 10 and 100 %.",
};

export const de: Record<keyof typeof en, string> = {
  "media.nav": "Videos",
  "media.title": "Videos",
  "media.description":
    "Aufzeichnungen und Lektionsvideos. Lade eine Aufnahme hoch, mach aus einer Kursaufnahme ein Video oder füge eines hinzu, das du auf YouTube oder Vimeo hast; Lektionen zeigen sie im Player deiner Akademie.",

  "media.add.title": "Video hinzufügen",
  "media.add.kind": "Was du hinzufügst",
  "media.add.kind.upload": "Hochladen",
  "media.add.kind.recording": "Kursaufnahme",
  "media.add.kind.embed": "YouTube oder Vimeo",
  "media.add.hint.upload":
    "MP4, MOV oder WebM, bis 4 GB. Wir bereiten es für jede Bildschirmgröße auf und schreiben Untertitel aus dem Gesagten; das dauert ein paar Minuten.",
  "media.add.hint.recording":
    "Bildschirmaufnahmen, die du einem Kurs als Quelle hinzugefügt hast. Das Video übernimmt Transkript und Themen als Untertitel und Kapitel.",
  "media.add.hint.embed":
    "Füge den Link zu einem Video auf YouTube oder Vimeo ein. Lernende laden es erst, wenn sie klicken, im erweiterten Datenschutzmodus.",
  "media.add.file": "Videodatei",
  "media.add.choose": "Video auswählen",
  "media.add.chosen": "{name}, {size}",
  "media.add.uploading": "Wird hochgeladen … {percent} %",
  "media.add.titleLabel": "Titel",
  "media.add.titlePlaceholder": "Leer lassen für den Dateinamen",
  "media.add.language": "Gesprochene Sprache",
  "media.add.languageHint": "Für die Untertitel.",
  "media.add.recording": "Aufnahme",
  "media.add.recordingOption": "{title} · {course}",
  "media.add.recordingPending": "{title} · {course} (wird noch transkribiert)",
  "media.add.noRecordings":
    "Noch kein Kurs hat eine Bildschirmaufnahme. Füge eine bei den Quellen eines Kurses hinzu und komm dann zurück.",
  "media.add.url": "Link zum Video",
  "media.add.submit.upload": "Hochladen und vorbereiten",
  "media.add.submit.recording": "Video daraus machen",
  "media.add.submit.embed": "Video hinzufügen",
  "media.add.added":
    "Hinzugefügt. Das Video wird vorbereitet; diese Seite aktualisiert sich, sobald es bereit ist.",
  "media.add.addedEmbed": "Hinzugefügt. Du kannst es jetzt in Lektionen zeigen.",

  "media.error.chooseFile": "Wähle zuerst eine Videodatei aus.",
  "media.error.storageQuota":
    "Im Videospeicher deiner Akademie ist kein Platz mehr für dieses Video. Lösch Videos, die du nicht mehr brauchst, oder bitte enaibler um mehr Platz.",
  "media.error.tooLarge": "„{name}“ ist größer als 4 GB.",
  "media.error.type": "„{name}“ ist kein MP4-, MOV- oder WebM-Video.",
  "media.error.failed": "„{name}“ konnte nicht hochgeladen werden. Bitte versuch es noch einmal.",
  "media.error.rateLimited": "Zu viele Uploads in kurzer Zeit. Bitte warte einen Moment.",
  "media.error.invalidUrl": "Das ist kein Link zu einem Video auf YouTube oder Vimeo.",
  "media.error.notVideo": "Diese Datei ist kein Video.",
  "media.error.inUse": "Dieser Upload ist schon in der Bibliothek.",
  "media.error.notReady":
    "Die Aufnahme wird noch transkribiert. Versuch es noch einmal, sobald ihr Transkript fertig ist.",
  "media.error.notFound": "Diese Aufnahme gibt es nicht mehr.",
  "media.error.gone": "Dieses Video gibt es nicht mehr.",
  "media.error.chaptersChanged":
    "Die Kapitel haben sich geändert, während du bearbeitet hast (das Transkript ist fertig geworden). Lade die Seite neu und benenne sie noch einmal.",
  "media.error.code.no_video": "Die Datei hat kein Bild, das wir lesen können.",
  "media.error.code.source_missing": "Die Kursaufnahme, aus der es entstand, wurde gelöscht.",
  "media.error.code.transcode_failed":
    "Die Vorbereitung ist fehlgeschlagen. Lade das Video noch einmal hoch oder exportiere es in einem anderen Format.",

  "media.storage.heading": "Videospeicher",
  "media.storage.used": "{percent} % belegt",
  "media.storage.meter": "Belegter Anteil am Videospeicher deiner Akademie",
  "media.storage.hint":
    "Uploads und die Fassungen, die wir für jede Bildschirmgröße vorbereiten, zählen; Videos auf YouTube oder Vimeo nicht.",
  "media.storage.warning": "Dein Videospeicher ist fast voll.",
  "media.storage.full":
    "Dein Videospeicher ist voll: Neue Uploads werden abgelehnt, bis du Videos löschst oder enaibler deiner Akademie mehr Platz gibt.",

  "media.list.heading": "Bibliothek",
  "media.list.caption": "Videos dieser Akademie",
  "media.list.empty": "Noch keine Videos",
  "media.list.emptyBody":
    "Lade eine Webinar-Aufzeichnung hoch oder füge ein YouTube-Video hinzu und zeig es dann in einer Lektion.",
  "media.column.video": "Video",
  "media.column.status": "Status",
  "media.column.length": "Länge",
  "media.column.access": "Wer es sehen kann",
  "media.column.viewers": "Zuschauende",
  "media.column.added": "Hinzugefügt",
  "media.kind.upload": "Hochgeladen",
  "media.kind.recording": "Kursaufnahme",
  "media.kind.youtube": "YouTube",
  "media.kind.vimeo": "Vimeo",
  "media.status.processing": "Wird vorbereitet",
  "media.status.ready": "Bereit",
  "media.status.failed": "Fehlgeschlagen",
  "media.access.learners": "Lernende",
  "media.access.public": "Öffentlich",
  "media.access.registrants": "Webinar-Angemeldete",

  "media.back": "Videos",
  "media.detail.preview": "Vorschau",
  "media.detail.previewHint":
    "So sehen Lernende es, im Design deiner Akademie. Was du hier ansiehst, wird nicht gezählt.",
  "media.detail.processing": "Das Video wird vorbereitet",
  "media.detail.processingBody":
    "Das dauert ein paar Minuten, bei langen Aufnahmen länger. Du kannst die Seite verlassen.",
  "media.detail.failed": "Das Video konnte nicht vorbereitet werden",
  "media.detail.captions": "Untertitel und Transkript",
  "media.detail.captions.processing": "Die Untertitel werden aus dem Gesagten geschrieben.",
  "media.detail.captions.ready":
    "Untertitel und ein durchsuchbares Transkript auf {language}, {lines} Zeilen.",
  "media.detail.captions.none": "Dieses Video hat keine Untertitel.",
  "media.detail.captions.embed": "{provider} zeigt in seinem Player eigene Untertitel.",
  "media.detail.captions.failed": "Keine Untertitel: {reason}",
  "media.detail.source": "Auf {provider}",
  "media.detail.details": "Angaben",
  "media.field.title": "Titel",
  "media.field.access": "Wer es sehen kann",
  "media.field.access.learners": "Angemeldete Lernende dieser Akademie",
  "media.field.access.learnersHint":
    "Die Voreinstellung. Lektionen sind ohnehin für angemeldete Lernende.",
  "media.field.access.registrants": "Wer sich für sein Webinar angemeldet hat",
  "media.field.access.registrantsHint":
    "Wird beim Webinar eingestellt, das dieses Video als Aufzeichnung zeigt.",
  "media.field.access.registrantsDetached":
    "Es ist keine Webinar-Aufzeichnung mehr, deshalb sieht es nur dein Team, bis du wählst, wer es sehen darf.",
  "media.field.access.public": "Alle auf der Seite deiner Akademie",
  "media.field.access.publicHint":
    "Bevor du eine Aufnahme öffentlich machst, stell sicher, dass alle, die darin zu sehen oder zu hören sind, zugestimmt haben.",
  "media.field.chapters": "Kapitel",
  "media.field.chaptersHint":
    "Sie beginnen, wo das Thema wechselt. Gib ihnen Namen, damit sich Lernende zurechtfinden.",
  "media.field.chapter": "Kapitel {n} bei {time}",
  "media.field.chapterPlaceholder": "Kapitel {n}",
  "media.save": "Speichern",
  "media.saved": "Gespeichert.",

  "media.watch.heading": "Wer geschaut hat",
  "media.watch.intro":
    "Nur angemeldete Lernende: Anonyme Zuschauende öffentlicher Videos werden nicht erfasst, und dein Team zählt nicht mit.",
  "media.watch.viewers": "Zuschauende",
  "media.watch.viewersHint": "haben auf Play gedrückt",
  "media.watch.watched": "Angesehen",
  "media.watch.watchedHint": "mindestens {percent} % davon abgespielt",
  "media.watch.average": "Angesehener Anteil",
  "media.watch.averageHint": "Prozent des Videos, im Schnitt",
  "media.retention.heading": "Zuschauende pro Minute",
  "media.retention.intro":
    "Wie viele Zuschauende mindestens die Hälfte jeder Minute gesehen haben. Wo die Säulen fallen, sind Leute gegangen.",
  "media.retention.caption": "Zuschauende pro Minute von „{title}“",
  "media.retention.axis": "Minuten",
  "media.retention.minute": "Minute {n}",
  "media.retention.viewers.one": "{n} Person",
  "media.retention.viewers.other": "{n} Personen",
  "media.retention.summary": "{first} in der ersten Minute, {last} in der letzten.",
  "media.retention.explore": "Mit den Pfeiltasten gehst du durch die Minuten.",
  "media.retention.table": "Als Tabelle zeigen",
  "media.retention.column.minute": "Minute",
  "media.retention.column.viewers": "Zuschauende",
  "media.retention.empty": "Noch hat niemand aus deinen Lernenden dieses Video angesehen.",
  "media.retention.noLength":
    "Der Verlauf erscheint, sobald der Player einer zuschauenden Person gemeldet hat, wie lang das Video ist.",

  "media.usedIn.heading": "In Lektionen",
  "media.usedIn.none":
    "Noch zeigt keine Lektion dieses Video. Wähle es im Editor einer Lektion aus.",
  "media.delete": "Video löschen",
  "media.deleteConfirm":
    "Dieses Video endgültig löschen? Seine Dateien werden entfernt, und Lektionen, die es zeigen, zeigen an seiner Stelle nichts.",
  "media.deleteConfirmWebinar":
    "Dieses Video endgültig löschen? Es ist die Aufzeichnung des Webinars „{webinar}“: Es wird zuerst vom Webinar entfernt, dessen Seite dann nur noch sagt, dass es vorbei ist. Seine Dateien werden entfernt, und Lektionen, die es zeigen, zeigen an seiner Stelle nichts.",
  "media.deleted": "Video gelöscht.",

  "media.webinar.heading": "Webinar-Aufzeichnung",
  "media.webinar.body":
    "Das ist die Aufzeichnung von „{webinar}“. Wer sie ansehen darf, stellst du dort ein: {access}.",
  "media.webinar.link": "Einstellungen der Aufzeichnung öffnen",

  "media.lesson.label": "Video",
  "media.lesson.none": "Kein Video",
  "media.lesson.hint": "Steht über dem Text, mit Kapiteln, Untertiteln und Transkript.",
  "media.lesson.manage": "Videos verwalten",
  "media.lesson.pending": "{title} (wird vorbereitet)",
  "media.lesson.previewNote": "Video: {title}. Es läuft in der Vorschau als Lernende:r.",

  "media.settings.heading": "Videos",
  "media.settings.threshold": "Ein Video gilt als angesehen ab",
  "media.settings.thresholdHint":
    "Der Anteil eines Videos, den Lernende wirklich abspielen müssen; Vorspulen zählt nicht. Zwischen 10 und 100 %.",
};
