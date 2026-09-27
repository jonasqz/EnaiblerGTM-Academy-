import type { Locale } from "@/core/i18n/locales";

/* "How it works": the loop in four stages, each with a real screen. */

const en = {
  meta: {
    title: "How enaibler works",
    description:
      "Build an academy from what you know, let learners prove what they can do, and turn every shared certificate into new learners and leads.",
  },
  hero: {
    eyebrow: "How it works",
    title: "From your expertise to your next client.",
    body: "An academy on enaibler runs in four stages. You set it up once; learners do the rest, and their work keeps bringing new people in.",
  },
  chapters: [
    {
      key: "build",
      eyebrow: "1 · Build",
      title: "Start from the result, not from the slides.",
      body: "Define what learners should build and what good looks like. The rubric becomes the backbone: every lesson teaches toward it, every review scores against it.",
      points: [
        "A starter rubric from an example of good work",
        "Lessons drafted from your recordings, documents, web pages and an interview",
        "A coverage map that shows which criterion isn't taught yet",
        "Your brand from your website, your domain, German and English",
      ],
      alt: "The Studio: what learners build in a course, and the criteria of its rubric",
    },
    {
      key: "learn",
      eyebrow: "2 · Learn and build",
      title: "Learners do the work, and get better at it.",
      body: "Short lessons lead to one hand-in: text, a form, a link, a PDF or images. Feedback arrives in minutes, per criterion, with a clear way to pass.",
      points: [
        "Lessons for any screen that remember where learners stopped",
        "Knowledge checks for practice along the way",
        "Revise and resubmit until the work passes",
        "Your team decides the close calls",
      ],
      alt: "Feedback on a hand-in: a score and an improvement note for every criterion",
    },
    {
      key: "share",
      eyebrow: "3 · Share",
      title: "Proof that travels.",
      body: "When the work passes, the learner receives a Certificate of Completion, private until they share it. Then it's two clicks to their LinkedIn profile or a post.",
      points: [
        "Add to profile, linked to your academy's LinkedIn page",
        "A suggested post in the learner's language, in your words",
        "An image of the certificate to post",
        "Every share carries its channel",
      ],
      alt: "The learner's share section: add to LinkedIn profile, a suggested post to copy, and an image to download",
    },
    {
      key: "grow",
      eyebrow: "4 · Grow",
      title: "Every certificate is a landing page.",
      body: "Whoever clicks a shared certificate sees what was built, the course behind it and your button to start. You see which post brought whom, and who wants to hear from you.",
      points: [
        "The certificate page doubles as your landing page",
        "New learners tagged with channel and certificate",
        "Leads with what they completed and where they came from",
        "CSV and webhooks for your CRM",
      ],
      alt: "A shared Certificate of Completion as a visitor sees it, with the course behind it and a button to start",
    },
  ],
  alts: {
    lesson: "A lesson on a phone, in the academy's own brand",
    preview: "The certificate's preview image, as LinkedIn shows it in a post",
    previewCaption: "What their network sees on LinkedIn",
    landing:
      "A shared Certificate of Completion on a phone: what the learner built, the course behind it and a button to start",
  },
  connect: {
    eyebrow: "Fits your stack",
    title: "Connect it to what you already use.",
    items: [
      {
        title: "Deep links",
        body: "Link any course from your website, newsletter or ads. Course, language and campaign come along through sign-up.",
      },
      {
        title: "Path picker for your site",
        body: "Embed your learning paths on your own website with one snippet.",
      },
      {
        title: "Webhooks",
        body: "Sign-ups, completions, shares and consents reach your CRM or automation tool as signed events.",
      },
      {
        title: "Your own domain",
        body: "Run the academy on academy.your-company.com, with automatic HTTPS.",
      },
      {
        title: "Open Badges",
        body: "Learners can export their certificate as a signed Open Badge.",
      },
      {
        title: "Analytics without cookies",
        body: "Page views without tracking cookies, and a funnel from sign-up to shared certificate in the Studio.",
      },
    ],
  },
};

export type HowCopy = typeof en;

const de: HowCopy = {
  meta: {
    title: "So funktioniert enaibler",
    description:
      "Bau eine Academy aus deinem Wissen, lass Lernende zeigen, was sie können, und mach aus jeder geteilten Abschlussbescheinigung neue Lernende und Leads.",
  },
  hero: {
    eyebrow: "So funktioniert’s",
    title: "Von deinem Wissen zu deinem nächsten Kunden.",
    body: "Eine Academy auf enaibler läuft in vier Stufen. Du richtest sie einmal ein; den Rest erledigen die Lernenden, und ihre Arbeit bringt immer neue Menschen zu dir.",
  },
  chapters: [
    {
      key: "build",
      eyebrow: "1 · Bauen",
      title: "Fang beim Ergebnis an, nicht bei den Folien.",
      body: "Lege fest, was Lernende bauen sollen und wie gut aussieht. Das Bewertungsschema wird zum Rückgrat: Jede Lektion arbeitet darauf hin, jede Bewertung misst daran.",
      points: [
        "Ein erstes Bewertungsschema aus einem Beispiel guter Arbeit",
        "Lektionen, entworfen aus deinen Aufnahmen, Dokumenten, Webseiten und einem Interview",
        "Eine Übersicht, welches Kriterium noch nicht unterrichtet wird",
        "Deine Marke von deiner Website, deine Domain, Deutsch und Englisch",
      ],
      alt: "Das Studio: was Lernende in einem Kurs bauen, und die Kriterien des Bewertungsschemas",
    },
    {
      key: "learn",
      eyebrow: "2 · Lernen und bauen",
      title: "Lernende machen die Arbeit und werden dabei besser.",
      body: "Kurze Lektionen führen zu einer Abgabe: Text, Formular, Link, PDF oder Bilder. Feedback kommt in Minuten, pro Kriterium, mit einem klaren Weg zum Bestehen.",
      points: [
        "Lektionen für jeden Bildschirm, die sich merken, wo man aufgehört hat",
        "Wissenschecks zum Üben unterwegs",
        "Überarbeiten und erneut abgeben, bis die Arbeit besteht",
        "Dein Team entscheidet die knappen Fälle",
      ],
      alt: "Feedback zu einer Abgabe: Punkte und ein Verbesserungshinweis zu jedem Kriterium",
    },
    {
      key: "share",
      eyebrow: "3 · Teilen",
      title: "Ein Nachweis, der sich herumspricht.",
      body: "Ist die Arbeit bestanden, gibt es eine Abschlussbescheinigung, privat, bis die Person sie teilt. Dann sind es zwei Klicks bis ins LinkedIn-Profil oder in einen Beitrag.",
      points: [
        "Ins Profil, verknüpft mit der LinkedIn-Seite deiner Academy",
        "Ein Textvorschlag in der Sprache der Lernenden, in deinen Worten",
        "Ein Bild der Abschlussbescheinigung zum Posten",
        "Jedes Teilen trägt seinen Kanal",
      ],
      alt: "Der Bereich zum Teilen: ins LinkedIn-Profil aufnehmen, ein Beitrag zum Kopieren und ein Bild zum Herunterladen",
    },
    {
      key: "grow",
      eyebrow: "4 · Wachsen",
      title: "Jede Abschlussbescheinigung ist eine Landingpage.",
      body: "Wer eine geteilte Abschlussbescheinigung anklickt, sieht, was gebaut wurde, den Kurs dahinter und deinen Button zum Start. Du siehst, welcher Beitrag wen gebracht hat und wer von dir hören möchte.",
      points: [
        "Die Seite der Abschlussbescheinigung ist zugleich deine Landingpage",
        "Neue Lernende mit Kanal und Abschlussbescheinigung als Herkunft",
        "Leads mit dem, was sie abgeschlossen haben, und woher sie kamen",
        "CSV und Webhooks für dein CRM",
      ],
      alt: "Eine geteilte Abschlussbescheinigung aus Sicht von Besucher:innen, mit dem Kurs dahinter und einem Button zum Start",
    },
  ],
  alts: {
    lesson: "Eine Lektion auf dem Handy, im Markenauftritt der Academy",
    preview: "Das Vorschaubild der Abschlussbescheinigung, wie LinkedIn es in einem Beitrag zeigt",
    previewCaption: "Was ihr Netzwerk auf LinkedIn sieht",
    landing:
      "Eine geteilte Abschlussbescheinigung auf dem Handy: was gebaut wurde, der Kurs dahinter und ein Button zum Start",
  },
  connect: {
    eyebrow: "Passt zu deinen Tools",
    title: "Verbinde es mit dem, was du schon nutzt.",
    items: [
      {
        title: "Deep Links",
        body: "Verlinke jeden Kurs von deiner Website, deinem Newsletter oder deinen Anzeigen. Kurs, Sprache und Kampagne kommen bis zur Anmeldung mit.",
      },
      {
        title: "Lernpfad-Auswahl für deine Website",
        body: "Bette deine Lernpfade mit einem Snippet auf deiner eigenen Website ein.",
      },
      {
        title: "Webhooks",
        body: "Anmeldungen, Abschlüsse, geteilte Abschlussbescheinigungen und Einwilligungen erreichen dein CRM oder Automatisierungstool als signierte Ereignisse.",
      },
      {
        title: "Deine eigene Domain",
        body: "Betreibe die Academy unter academy.deine-firma.de, mit automatischem HTTPS.",
      },
      {
        title: "Open Badges",
        body: "Lernende können ihre Abschlussbescheinigung als signiertes Open Badge exportieren.",
      },
      {
        title: "Analyse ohne Cookies",
        body: "Seitenaufrufe ohne Tracking-Cookies und im Studio ein Trichter von der Anmeldung bis zur geteilten Abschlussbescheinigung.",
      },
    ],
  },
};

export const HOW: Record<Locale, HowCopy> = { en, de };
