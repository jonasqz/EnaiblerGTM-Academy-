import type { Locale } from "@/core/i18n/locales";

/*
 * The website's home page: expertise → an academy → a go-to-market stream.
 * Every claim here is something the product does today (README "Status").
 */

const en = {
  meta: {
    title: "enaibler · Turn your expertise into your best source of clients",
    description:
      "Academies under your brand: learners build real work, get feedback in minutes and share the proof on LinkedIn, which brings you new learners and leads.",
  },
  hero: {
    eyebrow: "Academies for go-to-market",
    title: "Turn your expertise into your best source of",
    highlight: "clients.",
    body: "enaibler turns what you know into an academy under your brand. Learners apply your method to real work, get feedback in minutes and share the proof on LinkedIn, where it brings you the next learners and leads who already know how you work.",
    caption: "A shared Certificate of Completion: proof for the learner, a landing page for you.",
    preview: "What their network sees on LinkedIn",
    phoneAlt:
      "A shared Certificate of Completion on a phone: what the learner built, the course behind it and a button to start",
    previewAlt: "The certificate's preview image, as LinkedIn shows it in a post",
  },
  highlights: [
    {
      title: "Real work, not quizzes",
      body: "Every course ends with something learners build, or with a test if you prefer.",
    },
    {
      title: "Feedback in minutes",
      body: "AI reviews against your rubric. Your team decides the close calls.",
    },
    {
      title: "Leads with context",
      body: "See what someone built and where they came from before you talk.",
    },
  ],
  loop: {
    eyebrow: "The loop",
    title: "Everyone who finishes brings you the next learner.",
    intro:
      "Content marketing ends with a like. An academy ends with work people are proud to show, and every share starts the loop again.",
    steps: [
      {
        title: "Start from your website",
        body: "A link on your site, in your newsletter or your posts. Course, language and campaign come along, without tracking cookies.",
      },
      {
        title: "Learn your method",
        body: "Short lessons in your words and your brand, on any device, picked up where they left off.",
      },
      {
        title: "Build real work",
        body: "One concrete result per course: a plan, a brief, a playbook, whatever your method produces.",
      },
      {
        title: "Get feedback in minutes",
        body: "AI reviews the work against your rubric, criterion by criterion. Your team checks the close calls.",
      },
      {
        title: "Earn a Certificate of Completion",
        body: "Backed by the work, and private until the learner decides to show it.",
      },
      {
        title: "Share it on LinkedIn",
        body: "On the profile and as a post, in two clicks, with a text the learner can make their own.",
      },
      {
        title: "The next learner arrives",
        body: "Every shared certificate is a page with your brand, the course behind it and your button to start.",
      },
    ],
    again: "…and the loop starts again.",
    leadTitle: "Your pipeline fills up on the way",
    leadBody:
      "Learners who want to hear from you appear as leads, with what they completed and whether a shared certificate brought them. Export them, or send them to your CRM.",
  },
  why: {
    eyebrow: "Proof over points",
    title: "A badge says someone clicked through. Real work says they can do it.",
    intro:
      "Most course certificates say little, so few people share them and fewer read them. A Certificate of Completion backed by real work is worth both.",
    badge: {
      title: "Quiz badge",
      points: [
        "Shows that someone answered questions",
        "Looks like every other badge",
        "Tells you nothing about the person",
        "Easy to earn, easy to ignore",
      ],
    },
    proof: {
      title: "Certificate backed by real work",
      points: [
        "Shows what someone built with your method",
        "Carries your brand and links to your course",
        "Tells you what a lead can do and needs",
        "Worth sharing, and every view is a way in",
      ],
    },
  },
  features: {
    eyebrow: "What you get",
    title: "Everything from the first lesson to the first conversation.",
    items: [
      {
        title: "Your brand, your domain",
        body: "Your colours, fonts and words, taken from your website if you like, on your own domain. Learners see your academy; enaibler only says “Powered by enaibler”.",
      },
      {
        title: "Courses from what you already have",
        body: "Start from the result learners should build. AI drafts lessons from your screen recordings, documents, web pages and a short interview with you. Nothing goes live until you publish it.",
      },
      {
        title: "Feedback that scales",
        body: "Rubric-based AI review in minutes, with evidence quoted from the work. Close calls and spot checks go to your team, so the standard stays yours.",
      },
      {
        title: "Sharing built in",
        body: "LinkedIn profile and post in two clicks, a suggested post in the learner's language, and an image of the certificate to download.",
      },
      {
        title: "Leads and attribution",
        body: "A lead list with context, CSV export and webhooks. Every share carries its channel, so you know which post brought whom.",
      },
      {
        title: "Numbers that matter",
        body: "From sign-up to shared certificate: starts, hand-ins, completions, share rate, page views, new learners and new leads.",
      },
    ],
  },
  studio: {
    eyebrow: "In your Studio",
    title: "See what every share brings.",
    body: "The overview counts what learners share and what it brings back: visitors on certificate pages, clicks on your button, new learners and new leads. The lead list shows what each person completed and where they came from.",
    overviewAlt:
      "Studio overview: a funnel from sign-ups to button clicks, next to the sharing numbers of the last 30 days",
    leadsAlt:
      "Studio lead list: each lead with the course completed, whether it was shared on LinkedIn, and where the lead came from",
  },
  audiences: {
    eyebrow: "Made for",
    title: "For everyone whose expertise is the product.",
    items: [
      {
        key: "consultancies",
        title: "Consultancies & agencies",
        body: "Let prospects apply your method to their own case. The best of them become clients who already trust how you work.",
        link: "For consultancies and agencies",
      },
      {
        key: "software",
        title: "B2B software companies",
        body: "Teach the discipline your product serves. Buyers trust the company that made them better at their job.",
        link: "For software companies",
      },
    ],
    generic:
      "Trainer, expert or community? If people pay for what you know, the same loop works for you.",
  },
  trust: {
    eyebrow: "Trust",
    title: "Built for Europe, private by default.",
    items: [
      {
        title: "Hosted in the EU",
        body: "Everything runs on servers in the EU. No tracking cookies: only a session and a language setting.",
      },
      {
        title: "Private by default",
        body: "Nothing about a learner is public until they share it. Contact only with a separate opt-in.",
      },
      {
        title: "Honest credentials",
        body: "A Certificate of Completion says what someone did and promises no formal qualification: clear for learners, safe for you in German-speaking markets.",
      },
      {
        title: "German and English",
        body: "Every academy runs in one or both languages, including the feedback and the certificate.",
      },
    ],
  },
  start: {
    eyebrow: "Getting started",
    title: "Three steps to your first course.",
    steps: [
      {
        title: "Create your academy",
        body: "Name, address, language. A minute later you are in the Studio.",
      },
      {
        title: "Build your first course",
        body: "Choose the result learners should build, set the rubric, and let AI draft the lessons from your material.",
      },
      {
        title: "Publish and share",
        body: "Link the course from your website and your posts. From there, learners bring learners.",
      },
    ],
  },
  faq: [
    {
      q: "Is enaibler a learning management system?",
      a: "No. An LMS manages the courses you already have. enaibler builds academies around one thing: learners producing real work with your method, and that work bringing you the next learners and clients.",
    },
    {
      q: "Why would I give my method away?",
      a: "Because people buy from those who have already helped them. A course shows your method at work; clients come for what a course can't do: applying it to their business, with you.",
    },
    {
      q: "Do I have to write all the content myself?",
      a: "No. Start from the result learners should build and your material: screen recordings, documents, web pages or a short interview. AI drafts the lessons; you edit and publish.",
    },
    {
      q: "How good is the AI feedback?",
      a: "It scores each criterion of your rubric and quotes the work as evidence. Pass or fail is calculated from those scores, never guessed. Close calls and a share of all reviews go to your team, and the Studio shows how often AI and your reviewers agree.",
    },
    {
      q: "Can a course end with a test instead of work?",
      a: "Yes. You choose per course: real work, a final multiple-choice test, or both. The certificate always says how it was earned.",
    },
    {
      q: "Why a Certificate of Completion?",
      a: "Because it says exactly what happened: someone completed your course and built real work. It promises no formal qualification, which keeps you on the safe side in Germany, Austria and Switzerland.",
    },
    {
      q: "Where is my data?",
      a: "On servers in the EU. No tracking cookies, and learners' data stays private unless they decide otherwise.",
    },
    {
      q: "Can I use my own domain?",
      a: "Yes. Start on an enaibler address and connect your own domain whenever you like; existing links keep working.",
    },
  ],
};

export type HomeCopy = typeof en;

const de: HomeCopy = {
  meta: {
    title: "enaibler · Mach dein Wissen zu deiner besten Quelle für neue Kunden",
    description:
      "Academies in deiner Marke: Lernende liefern echte Arbeit ab, bekommen in Minuten Feedback und teilen den Nachweis auf LinkedIn. Das bringt dir neue Lernende und Leads.",
  },
  hero: {
    eyebrow: "Academies als Vertriebskanal",
    title: "Mach dein Wissen zu deiner besten Quelle für neue",
    highlight: "Kunden.",
    body: "enaibler macht aus deinem Wissen eine Academy in deiner Marke. Lernende wenden deine Methode auf echte Arbeit an, bekommen in Minuten Feedback und teilen den Nachweis auf LinkedIn. Dort bringt er dir die nächsten Lernenden und Leads, die deine Arbeitsweise schon kennen.",
    caption:
      "Eine geteilte Abschlussbescheinigung: Nachweis für die Lernenden, Landingpage für dich.",
    preview: "Was ihr Netzwerk auf LinkedIn sieht",
    phoneAlt:
      "Eine geteilte Abschlussbescheinigung auf dem Handy: was gebaut wurde, der Kurs dahinter und ein Button zum Start",
    previewAlt:
      "Das Vorschaubild der Abschlussbescheinigung, wie LinkedIn es in einem Beitrag zeigt",
  },
  highlights: [
    {
      title: "Echte Arbeit statt Quiz",
      body: "Jeder Kurs endet mit etwas, das Lernende bauen, oder mit einem Test, wenn du willst.",
    },
    {
      title: "Feedback in Minuten",
      body: "Die KI bewertet nach deinem Bewertungsschema. Dein Team entscheidet die knappen Fälle.",
    },
    {
      title: "Leads mit Kontext",
      body: "Du siehst, was jemand gebaut hat und woher die Person kam, bevor ihr sprecht.",
    },
  ],
  loop: {
    eyebrow: "Der Kreislauf",
    title: "Alle, die fertig werden, bringen dir die Nächsten.",
    intro:
      "Content-Marketing endet mit einem Like. Eine Academy endet mit Arbeit, die Menschen gern zeigen, und jedes Teilen startet den Kreislauf neu.",
    steps: [
      {
        title: "Start auf deiner Website",
        body: "Ein Link auf deiner Website, in deinem Newsletter oder deinen Beiträgen. Kurs, Sprache und Kampagne kommen mit, ohne Tracking-Cookies.",
      },
      {
        title: "Deine Methode lernen",
        body: "Kurze Lektionen in deinen Worten und deiner Marke, auf jedem Gerät. Weiter geht es genau dort, wo man aufgehört hat.",
      },
      {
        title: "Echte Arbeit bauen",
        body: "Ein konkretes Ergebnis pro Kurs: ein Plan, ein Brief, ein Playbook, was deine Methode eben hervorbringt.",
      },
      {
        title: "Feedback in Minuten",
        body: "Die KI bewertet die Arbeit nach deinem Bewertungsschema, Kriterium für Kriterium. Dein Team prüft die knappen Fälle.",
      },
      {
        title: "Abschlussbescheinigung erhalten",
        body: "Gestützt auf die Arbeit und privat, bis die Person sie zeigen will.",
      },
      {
        title: "Auf LinkedIn teilen",
        body: "Im Profil und als Beitrag, mit zwei Klicks und einem Text, den man sich zu eigen machen kann.",
      },
      {
        title: "Die Nächsten kommen",
        body: "Jede geteilte Abschlussbescheinigung ist eine Seite mit deiner Marke, dem Kurs dahinter und deinem Button zum Start.",
      },
    ],
    again: "…und der Kreislauf beginnt von vorn.",
    leadTitle: "Nebenbei füllt sich deine Pipeline",
    leadBody:
      "Wer von dir hören möchte, erscheint als Lead: mit dem, was die Person abgeschlossen hat, und ob eine geteilte Abschlussbescheinigung sie gebracht hat. Exportiere die Leads oder schick sie in dein CRM.",
  },
  why: {
    eyebrow: "Nachweis statt Punkte",
    title:
      "Ein Badge zeigt, dass jemand durchgeklickt hat. Echte Arbeit zeigt, dass jemand es kann.",
    intro:
      "Die meisten Kursbescheinigungen sagen wenig, also teilt sie kaum jemand, und noch weniger lesen sie. Eine Abschlussbescheinigung, hinter der echte Arbeit steht, ist beides wert.",
    badge: {
      title: "Quiz-Badge",
      points: [
        "Zeigt, dass jemand Fragen beantwortet hat",
        "Sieht aus wie jedes andere Badge",
        "Sagt dir nichts über die Person",
        "Leicht verdient, leicht übersehen",
      ],
    },
    proof: {
      title: "Abschlussbescheinigung mit echter Arbeit",
      points: [
        "Zeigt, was jemand mit deiner Methode gebaut hat",
        "Trägt deine Marke und verlinkt auf deinen Kurs",
        "Sagt dir, was ein Lead kann und braucht",
        "Lohnt sich zu teilen, und jeder Aufruf ist ein Einstieg",
      ],
    },
  },
  features: {
    eyebrow: "Was du bekommst",
    title: "Alles von der ersten Lektion bis zum ersten Gespräch.",
    items: [
      {
        title: "Deine Marke, deine Domain",
        body: "Deine Farben, Schriften und Begriffe, auf Wunsch von deiner Website übernommen, unter deiner eigenen Domain. Lernende sehen deine Academy; von enaibler steht dort nur „Powered by enaibler“.",
      },
      {
        title: "Kurse aus dem, was du schon hast",
        body: "Starte mit dem Ergebnis, das Lernende bauen sollen. Die KI entwirft Lektionen aus deinen Bildschirmaufnahmen, Dokumenten, Webseiten und einem kurzen Interview mit dir. Live geht nur, was du veröffentlichst.",
      },
      {
        title: "Feedback, das mitwächst",
        body: "KI-Bewertung nach deinem Bewertungsschema in Minuten, mit Belegen aus der Arbeit. Knappe Fälle und Stichproben gehen an dein Team, damit der Maßstab deiner bleibt.",
      },
      {
        title: "Teilen eingebaut",
        body: "LinkedIn-Profil und -Beitrag mit zwei Klicks, ein Textvorschlag in der Sprache der Lernenden und ein Bild der Abschlussbescheinigung zum Herunterladen.",
      },
      {
        title: "Leads und Herkunft",
        body: "Eine Lead-Liste mit Kontext, CSV-Export und Webhooks. Jedes Teilen trägt seinen Kanal, damit du weißt, welcher Beitrag wen gebracht hat.",
      },
      {
        title: "Zahlen, die zählen",
        body: "Von der Anmeldung bis zur geteilten Abschlussbescheinigung: Starts, Abgaben, Abschlüsse, Teilen-Quote, Seitenaufrufe, neue Lernende und neue Leads.",
      },
    ],
  },
  studio: {
    eyebrow: "In deinem Studio",
    title: "Sieh, was jedes Teilen bringt.",
    body: "Die Übersicht zählt, was Lernende teilen und was zurückkommt: Besuche auf Abschlussbescheinigungen, Klicks auf deinen Button, neue Lernende und neue Leads. Die Lead-Liste zeigt, was jede Person abgeschlossen hat und woher sie kam.",
    overviewAlt:
      "Studio-Übersicht: ein Trichter von Anmeldungen bis zu Button-Klicks, daneben die Zahlen zum Teilen der letzten 30 Tage",
    leadsAlt:
      "Lead-Liste im Studio: jeder Lead mit abgeschlossenem Kurs, ob auf LinkedIn geteilt, und woher er kam",
  },
  audiences: {
    eyebrow: "Gemacht für",
    title: "Für alle, deren Wissen das Produkt ist.",
    items: [
      {
        key: "consultancies",
        title: "Beratungen & Agenturen",
        body: "Lass Interessierte deine Methode auf ihren eigenen Fall anwenden. Die Besten werden Kunden, die deiner Arbeitsweise schon vertrauen.",
        link: "Für Beratungen und Agenturen",
      },
      {
        key: "software",
        title: "B2B-Softwareunternehmen",
        body: "Bring deinem Markt die Disziplin bei, für die dein Produkt gemacht ist. Käufer vertrauen dem Unternehmen, das sie in ihrem Job besser gemacht hat.",
        link: "Für Softwareunternehmen",
      },
    ],
    generic:
      "Trainer, Expertin oder Community? Wenn Menschen für dein Wissen bezahlen, funktioniert derselbe Kreislauf auch für dich.",
  },
  trust: {
    eyebrow: "Vertrauen",
    title: "Für Europa gebaut, standardmäßig privat.",
    items: [
      {
        title: "In der EU gehostet",
        body: "Alles läuft auf Servern in der EU. Keine Tracking-Cookies: nur eine Sitzung und die Spracheinstellung.",
      },
      {
        title: "Standardmäßig privat",
        body: "Nichts über Lernende ist öffentlich, bevor sie es teilen. Kontakt nur mit separater Einwilligung.",
      },
      {
        title: "Ehrliche Nachweise",
        body: "Eine Abschlussbescheinigung sagt, was jemand getan hat, und verspricht keine formale Qualifikation: klar für Lernende, sicher für dich im deutschsprachigen Raum.",
      },
      {
        title: "Deutsch und Englisch",
        body: "Jede Academy läuft in einer oder beiden Sprachen, inklusive Feedback und Abschlussbescheinigung.",
      },
    ],
  },
  start: {
    eyebrow: "Loslegen",
    title: "In drei Schritten zum ersten Kurs.",
    steps: [
      {
        title: "Academy erstellen",
        body: "Name, Adresse, Sprache. Eine Minute später bist du im Studio.",
      },
      {
        title: "Ersten Kurs bauen",
        body: "Wähle das Ergebnis, lege das Bewertungsschema fest und lass die KI die Lektionen aus deinem Material entwerfen.",
      },
      {
        title: "Veröffentlichen und teilen",
        body: "Verlinke den Kurs auf deiner Website und in deinen Beiträgen. Ab dann bringen Lernende Lernende.",
      },
    ],
  },
  faq: [
    {
      q: "Ist enaibler ein Learning-Management-System?",
      a: "Nein. Ein LMS verwaltet Kurse, die du schon hast. enaibler baut Academies um eine Sache herum: Lernende liefern mit deiner Methode echte Arbeit ab, und diese Arbeit bringt dir die nächsten Lernenden und Kunden.",
    },
    {
      q: "Warum sollte ich meine Methode verschenken?",
      a: "Weil Menschen bei denen kaufen, die ihnen schon geholfen haben. Ein Kurs zeigt deine Methode in Aktion; Kunden kommen für das, was ein Kurs nicht kann: sie mit dir auf ihr Geschäft anzuwenden.",
    },
    {
      q: "Muss ich alle Inhalte selbst schreiben?",
      a: "Nein. Starte mit dem Ergebnis, das Lernende bauen sollen, und deinem Material: Bildschirmaufnahmen, Dokumente, Webseiten oder ein kurzes Interview. Die KI entwirft die Lektionen, du bearbeitest und veröffentlichst.",
    },
    {
      q: "Wie gut ist das KI-Feedback?",
      a: "Die KI bewertet jedes Kriterium deines Bewertungsschemas und zitiert die Arbeit als Beleg. Bestanden oder nicht wird aus diesen Punkten berechnet, nie geraten. Knappe Fälle und ein Teil aller Bewertungen gehen an dein Team, und das Studio zeigt, wie oft KI und dein Team übereinstimmen.",
    },
    {
      q: "Kann ein Kurs mit einem Test statt mit Arbeit enden?",
      a: "Ja. Du entscheidest pro Kurs: echte Arbeit, ein Abschlusstest mit Multiple Choice oder beides. Die Abschlussbescheinigung sagt immer, wie sie erworben wurde.",
    },
    {
      q: "Warum eine Abschlussbescheinigung?",
      a: "Weil sie genau sagt, was passiert ist: Jemand hat deinen Kurs abgeschlossen und echte Arbeit abgeliefert. Sie verspricht keine formale Qualifikation, und damit bist du in Deutschland, Österreich und der Schweiz auf der sicheren Seite.",
    },
    {
      q: "Wo liegen meine Daten?",
      a: "Auf Servern in der EU. Keine Tracking-Cookies, und die Daten der Lernenden bleiben privat, solange sie nichts anderes entscheiden.",
    },
    {
      q: "Kann ich meine eigene Domain nutzen?",
      a: "Ja. Starte mit einer enaibler-Adresse und verbinde deine eigene Domain, wann du willst; bestehende Links funktionieren weiter.",
    },
  ],
};

export const HOME: Record<Locale, HomeCopy> = { en, de };
