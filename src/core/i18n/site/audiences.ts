import type { Locale } from "@/core/i18n/locales";

/*
 * Landing pages per customer type. Same shape for each: the problem, the
 * shift, how the academy fits, an illustrative course (never a customer
 * story), what it brings, questions.
 */

const consultanciesEn = {
  meta: {
    title: "enaibler for consultancies and agencies",
    description:
      "Turn your method into a course where prospects apply it to their own case. Their work proves your method, and the best of them become clients.",
  },
  hero: {
    eyebrow: "For consultancies & agencies",
    title: "Let your method win you clients.",
    body: "Turn your framework into a free course where prospects apply it to their own business. Every finished piece of work proves your method works, and the people who built it are the warmest leads you will ever get.",
    alt: "Feedback on a learner's hand-in, scored criterion by criterion against the consultancy's rubric",
  },
  problems: {
    title: "Why the usual marketing stalls",
    items: [
      {
        title: "Content gets likes, not clients",
        body: "Posts and articles show that you know things. They don't show what working with you is like.",
      },
      {
        title: "Webinars are forgotten by Friday",
        body: "An hour of listening changes nothing in the listener's business, so nothing connects them back to you.",
      },
      {
        title: "Downloads go unread",
        body: "A whitepaper collects an e-mail address and a lot of silence.",
      },
    ],
  },
  shift: {
    title: "An academy lets prospects experience your work.",
    body: "Instead of telling people how you would solve their problem, let them solve a piece of it with your method. By the end they have a result they can use, a Certificate of Completion they want to show, and a clear idea of what you would do for them.",
  },
  how: {
    title: "Your method as a course",
    steps: [
      {
        title: "Pick one result",
        body: "The part of your method a client can do alone in an hour or two: a positioning statement, an interview plan, a pricing sheet.",
      },
      {
        title: "Turn your material into lessons",
        body: "Record yourself walking through it, add your templates and articles. AI drafts the lessons; you sharpen them.",
      },
      {
        title: "Set your standard",
        body: "Your rubric decides what good looks like. AI applies it in minutes; you look at the close calls.",
      },
      {
        title: "Let the work travel",
        body: "Learners share their certificate on LinkedIn, in front of colleagues, managers and peers: exactly the people who buy consulting.",
      },
    ],
  },
  example: {
    title: "What it can look like",
    intro: "An example, not a customer story.",
    course: "Run five customer interviews",
    artifactLabel: "Learners build",
    artifact: "An interview findings brief",
    criteriaLabel: "Scored on",
    criteria: [
      "Who has the problem, in their own words",
      "Evidence from at least five interviews",
      "The next step, and how you will know it worked",
    ],
    note: "Fits a research, product or strategy consultancy. The finished briefs show prospects what your method delivers, and show you who is ready for more.",
  },
  outcomes: {
    title: "What you get out of it",
    items: [
      {
        title: "Leads who know your method",
        body: "When learners agree to be contacted, you see what they built. Your first call starts at their result, not at zero.",
      },
      {
        title: "Proof that your method works",
        body: "Every passed hand-in is evidence you can point to, scored against your own standard.",
      },
      {
        title: "Reach into the right networks",
        body: "Certificates on LinkedIn carry your academy's name to the people your learners work with.",
      },
      {
        title: "Your standard at scale",
        body: "Feedback in minutes, in your words, without a team grading homework.",
      },
    ],
  },
  faq: [
    {
      q: "Won't I give my method away?",
      a: "You give away the first step. Clients hire you for what a course can't do: applying the method to their situation, with your judgement. A course shows them what that is worth.",
    },
    {
      q: "How much work is the first course?",
      a: "Less than a workshop. Start from recordings, slides and templates you already have; AI drafts the lessons from them, and you edit.",
    },
    {
      q: "Can my team review the work?",
      a: "Yes. Choose per course: AI decides and your team spot-checks, AI drafts and a person confirms, or only people review.",
    },
    {
      q: "Will it carry our brand?",
      a: "Your colours, fonts, words and domain. Learners see your academy, and enaibler only as “Powered by enaibler”.",
    },
  ],
};

export type AudienceCopy = typeof consultanciesEn;

const consultanciesDe: AudienceCopy = {
  meta: {
    title: "enaibler für Beratungen und Agenturen",
    description:
      "Mach aus deiner Methode einen Kurs, in dem Interessierte sie auf ihren eigenen Fall anwenden. Ihre Arbeit beweist deine Methode, und die Besten werden Kunden.",
  },
  hero: {
    eyebrow: "Für Beratungen & Agenturen",
    title: "Lass deine Methode Kunden gewinnen.",
    body: "Mach aus deinem Framework einen kostenlosen Kurs, in dem Interessierte es auf ihr eigenes Geschäft anwenden. Jede fertige Arbeit beweist, dass deine Methode funktioniert, und die Menschen dahinter sind die wärmsten Leads, die du je bekommst.",
    alt: "Feedback zur Abgabe einer lernenden Person, Kriterium für Kriterium nach dem Bewertungsschema der Beratung",
  },
  problems: {
    title: "Warum übliches Marketing stockt",
    items: [
      {
        title: "Content bringt Likes, keine Kunden",
        body: "Beiträge und Artikel zeigen, dass du etwas weißt. Sie zeigen nicht, wie sich die Zusammenarbeit mit dir anfühlt.",
      },
      {
        title: "Webinare sind am Freitag vergessen",
        body: "Eine Stunde Zuhören ändert nichts am Geschäft der Zuhörenden, also verbindet sie danach auch nichts mit dir.",
      },
      {
        title: "Downloads bleiben ungelesen",
        body: "Ein Whitepaper sammelt eine E-Mail-Adresse und viel Schweigen.",
      },
    ],
  },
  shift: {
    title: "Mit einer Academy erleben Interessierte deine Arbeit.",
    body: "Statt zu erzählen, wie du ihr Problem lösen würdest, lass sie ein Stück davon mit deiner Methode lösen. Am Ende haben sie ein Ergebnis, das sie nutzen können, eine Abschlussbescheinigung, die sie zeigen wollen, und eine klare Vorstellung davon, was du für sie tun würdest.",
  },
  how: {
    title: "Deine Methode als Kurs",
    steps: [
      {
        title: "Ein Ergebnis wählen",
        body: "Den Teil deiner Methode, den Kunden in ein, zwei Stunden allein schaffen: ein Positionierungs-Statement, einen Interviewplan, ein Preisblatt.",
      },
      {
        title: "Material in Lektionen verwandeln",
        body: "Nimm dich auf, während du es durchgehst, und füge Vorlagen und Artikel hinzu. Die KI entwirft die Lektionen, du schärfst sie.",
      },
      {
        title: "Deinen Maßstab setzen",
        body: "Dein Bewertungsschema legt fest, wie gut aussieht. Die KI wendet es in Minuten an, du schaust auf die knappen Fälle.",
      },
      {
        title: "Die Arbeit für dich werben lassen",
        body: "Lernende teilen ihre Abschlussbescheinigung auf LinkedIn, vor Kolleg:innen, Vorgesetzten und Peers: genau den Menschen, die Beratung einkaufen.",
      },
    ],
  },
  example: {
    title: "So kann es aussehen",
    intro: "Ein Beispiel, keine Kundengeschichte.",
    course: "Fünf Kundeninterviews führen",
    artifactLabel: "Lernende bauen",
    artifact: "Ein Brief mit den Erkenntnissen aus den Interviews",
    criteriaLabel: "Bewertet nach",
    criteria: [
      "Wer das Problem hat, in eigenen Worten",
      "Belege aus mindestens fünf Interviews",
      "Der nächste Schritt und woran du merkst, dass er gewirkt hat",
    ],
    note: "Passt zu einer Research-, Produkt- oder Strategieberatung. Die fertigen Briefs zeigen Interessierten, was deine Methode leistet, und dir, wer bereit für mehr ist.",
  },
  outcomes: {
    title: "Was du davon hast",
    items: [
      {
        title: "Leads, die deine Methode kennen",
        body: "Wenn Lernende zustimmen, kontaktiert zu werden, siehst du, was sie gebaut haben. Dein erstes Gespräch beginnt bei ihrem Ergebnis, nicht bei null.",
      },
      {
        title: "Belege, dass deine Methode wirkt",
        body: "Jede bestandene Abgabe ist ein Beleg, auf den du zeigen kannst, bewertet nach deinem eigenen Maßstab.",
      },
      {
        title: "Reichweite in die richtigen Netzwerke",
        body: "Abschlussbescheinigungen auf LinkedIn tragen den Namen deiner Academy zu den Menschen, mit denen deine Lernenden arbeiten.",
      },
      {
        title: "Dein Maßstab, skaliert",
        body: "Feedback in Minuten, in deinen Worten, ohne ein Team, das Hausaufgaben korrigiert.",
      },
    ],
  },
  faq: [
    {
      q: "Verschenke ich damit nicht meine Methode?",
      a: "Du verschenkst den ersten Schritt. Kunden holen dich für das, was ein Kurs nicht kann: die Methode mit deinem Urteil auf ihre Lage anzuwenden. Ein Kurs zeigt ihnen, was das wert ist.",
    },
    {
      q: "Wie viel Arbeit ist der erste Kurs?",
      a: "Weniger als ein Workshop. Starte mit Aufnahmen, Folien und Vorlagen, die du schon hast; die KI entwirft daraus die Lektionen, du bearbeitest.",
    },
    {
      q: "Kann mein Team die Arbeiten bewerten?",
      a: "Ja. Du wählst pro Kurs: Die KI entscheidet und dein Team prüft Stichproben, die KI entwirft und ein Mensch bestätigt, oder nur Menschen bewerten.",
    },
    {
      q: "Trägt es unsere Marke?",
      a: "Deine Farben, Schriften, Begriffe und Domain. Lernende sehen deine Academy, enaibler nur als „Powered by enaibler“.",
    },
  ],
};

const softwareEn: AudienceCopy = {
  meta: {
    title: "enaibler for B2B software companies",
    description:
      "Teach the discipline your product serves. An academy on your domain builds authority, puts your brand in your users' networks and brings leads with context.",
  },
  hero: {
    eyebrow: "For B2B software companies",
    title: "Teach your field. Win its buyers.",
    body: "Buyers trust the company that made them better at their job. An academy on your domain teaches the discipline your product serves, and every certificate your learners share puts your brand in front of their colleagues.",
    alt: "A shared Certificate of Completion as a visitor sees it, with the course behind it and a button to start",
  },
  problems: {
    title: "Why teach the field, not just the product",
    items: [
      {
        title: "Reach before the buying cycle",
        body: "People learn a discipline long before they shop for a tool. Meet them there, under your brand.",
      },
      {
        title: "Authority you can't buy",
        body: "Being the place where your market learns its craft beats being one more vendor with a demo.",
      },
      {
        title: "Product courses when you are ready",
        body: "Start with the field. Add courses on your product for customers once the academy runs.",
      },
    ],
  },
  shift: {
    title: "Be the place your market learns its craft.",
    body: "When buyers get better at their job with you, the tool question answers itself: they already know who understands their work. And every certificate they share tells their network where they learned it.",
  },
  how: {
    title: "How it fits your go-to-market",
    steps: [
      {
        title: "Choose a job your buyers must get right",
        body: "The one your product makes easier: getting invoices paid, running discovery, closing the month.",
      },
      {
        title: "Build the course around a real result",
        body: "A reminder playbook, an interview plan, a month-end checklist: learners build it for their own company.",
      },
      {
        title: "Let certificates do the outreach",
        body: "Learners add the certificate to their profile and post about it. Each share leads colleagues to your course.",
      },
      {
        title: "Hand warm leads to sales",
        body: "Learners who agree to be contacted arrive with their result and their source, as CSV or through webhooks into your CRM.",
      },
    ],
  },
  example: {
    title: "What it can look like",
    intro: "An example, not a customer story.",
    course: "Get paid on time",
    artifactLabel: "Learners build",
    artifact: "A reminder playbook",
    criteriaLabel: "Scored on",
    criteria: [
      "Late invoices found, with amount and days overdue",
      "A reminder that names invoice, amount and a new date",
      "A follow-up plan for reminders that are ignored",
    ],
    note: "Fits invoicing or accounting software. Learners fix a real problem in their business, and the finished playbooks show which companies feel it most.",
  },
  outcomes: {
    title: "What it brings",
    items: [
      {
        title: "Pipeline with context",
        body: "Know what a lead built and which course or post brought them before sales reaches out.",
      },
      {
        title: "Attribution without cookies",
        body: "Every share and click carries its channel and certificate, from LinkedIn to sign-up.",
      },
      {
        title: "Champions inside accounts",
        body: "People who finished your course speak your language before the first demo.",
      },
      {
        title: "Data that stays in the EU",
        body: "Hosted in the EU, no tracking cookies, consent handled properly.",
      },
    ],
  },
  faq: [
    {
      q: "Is this customer onboarding?",
      a: "It can be, later. Most start with courses on the field their buyers work in: that's where new people come from. Product courses for customers work the same way.",
    },
    {
      q: "Does it connect to our CRM?",
      a: "Through webhooks and CSV: sign-ups, completions, shares and consents arrive as signed events your CRM or automation tool can pick up.",
    },
    {
      q: "Can we run it on our own domain?",
      a: "Yes, for example on academy.your-company.com, with automatic HTTPS.",
    },
    {
      q: "What about GDPR?",
      a: "Hosted in the EU, no tracking cookies, contact only with a separate opt-in, and marketing mail only after double opt-in.",
    },
  ],
};

const softwareDe: AudienceCopy = {
  meta: {
    title: "enaibler für B2B-Softwareunternehmen",
    description:
      "Bring deinem Markt die Disziplin bei, für die dein Produkt gemacht ist. Eine Academy unter deiner Domain schafft Autorität und liefert Leads mit Kontext.",
  },
  hero: {
    eyebrow: "Für B2B-Softwareunternehmen",
    title: "Bring deinem Markt etwas bei. Gewinne seine Käufer.",
    body: "Käufer vertrauen dem Unternehmen, das sie in ihrem Job besser gemacht hat. Eine Academy unter deiner Domain lehrt die Disziplin, für die dein Produkt gemacht ist, und jede geteilte Abschlussbescheinigung bringt deine Marke vor die Kolleg:innen deiner Lernenden.",
    alt: "Eine geteilte Abschlussbescheinigung aus Sicht von Besucher:innen, mit dem Kurs dahinter und einem Button zum Start",
  },
  problems: {
    title: "Warum das Fach lehren, nicht nur das Produkt",
    items: [
      {
        title: "Reichweite vor dem Kaufprozess",
        body: "Menschen lernen ein Fach lange, bevor sie ein Tool suchen. Triff sie dort, in deiner Marke.",
      },
      {
        title: "Autorität, die man nicht kaufen kann",
        body: "Der Ort zu sein, an dem dein Markt sein Handwerk lernt, schlägt jeden weiteren Anbieter mit Demo.",
      },
      {
        title: "Produktkurse, wenn du so weit bist",
        body: "Starte mit dem Fach. Kurse zu deinem Produkt für Kunden kommen dazu, sobald die Academy läuft.",
      },
    ],
  },
  shift: {
    title: "Sei der Ort, an dem dein Markt sein Handwerk lernt.",
    body: "Wenn Käufer mit dir in ihrem Job besser werden, beantwortet sich die Tool-Frage fast von selbst: Sie wissen schon, wer ihre Arbeit versteht. Und jede Abschlussbescheinigung, die sie teilen, erzählt ihrem Netzwerk, wo sie es gelernt haben.",
  },
  how: {
    title: "So passt es in deinen Go-to-Market",
    steps: [
      {
        title: "Eine Aufgabe wählen, die deine Käufer beherrschen müssen",
        body: "Die, die dein Produkt leichter macht: Rechnungen bezahlt bekommen, Discovery führen, den Monat abschließen.",
      },
      {
        title: "Den Kurs um ein echtes Ergebnis bauen",
        body: "Ein Mahn-Playbook, ein Interviewplan, eine Checkliste für den Monatsabschluss: Lernende bauen es für ihr eigenes Unternehmen.",
      },
      {
        title: "Abschlussbescheinigungen übernehmen die Ansprache",
        body: "Lernende nehmen die Abschlussbescheinigung ins Profil auf und posten darüber. Jedes Teilen führt Kolleg:innen zu deinem Kurs.",
      },
      {
        title: "Warme Leads an den Vertrieb",
        body: "Lernende, die zustimmen, kontaktiert zu werden, kommen mit Ergebnis und Herkunft, als CSV oder per Webhook in dein CRM.",
      },
    ],
  },
  example: {
    title: "So kann es aussehen",
    intro: "Ein Beispiel, keine Kundengeschichte.",
    course: "Pünktlich bezahlt werden",
    artifactLabel: "Lernende bauen",
    artifact: "Ein Mahn-Playbook",
    criteriaLabel: "Bewertet nach",
    criteria: [
      "Überfällige Rechnungen gefunden, mit Betrag und Verzug",
      "Eine Erinnerung, die Rechnung, Betrag und neues Datum nennt",
      "Ein Plan für Erinnerungen, die ignoriert werden",
    ],
    note: "Passt zu Rechnungs- oder Buchhaltungssoftware. Lernende lösen ein echtes Problem in ihrem Geschäft, und die fertigen Playbooks zeigen, welche Unternehmen es am stärksten spüren.",
  },
  outcomes: {
    title: "Was es bringt",
    items: [
      {
        title: "Pipeline mit Kontext",
        body: "Du weißt, was ein Lead gebaut hat und welcher Kurs oder Beitrag ihn gebracht hat, bevor der Vertrieb anruft.",
      },
      {
        title: "Herkunft ohne Cookies",
        body: "Jedes Teilen und jeder Klick trägt Kanal und Abschlussbescheinigung, von LinkedIn bis zur Anmeldung.",
      },
      {
        title: "Fürsprecher in den Accounts",
        body: "Wer deinen Kurs abgeschlossen hat, spricht deine Sprache schon vor der ersten Demo.",
      },
      {
        title: "Daten bleiben in der EU",
        body: "In der EU gehostet, keine Tracking-Cookies, Einwilligungen sauber geregelt.",
      },
    ],
  },
  faq: [
    {
      q: "Ist das Kunden-Onboarding?",
      a: "Später gern. Die meisten starten mit Kursen zu dem Fach, in dem ihre Käufer arbeiten: Dort kommen neue Menschen her. Produktkurse für Kunden funktionieren genauso.",
    },
    {
      q: "Lässt es sich mit unserem CRM verbinden?",
      a: "Über Webhooks und CSV: Anmeldungen, Abschlüsse, geteilte Abschlussbescheinigungen und Einwilligungen kommen als signierte Ereignisse, die dein CRM oder Automatisierungstool aufnehmen kann.",
    },
    {
      q: "Können wir es unter unserer eigenen Domain betreiben?",
      a: "Ja, zum Beispiel unter academy.deine-firma.de, mit automatischem HTTPS.",
    },
    {
      q: "Und die DSGVO?",
      a: "In der EU gehostet, keine Tracking-Cookies, Kontakt nur mit separater Einwilligung und Marketing-Mails nur nach Double-Opt-in.",
    },
  ],
};

export const CONSULTANCIES: Record<Locale, AudienceCopy> = {
  en: consultanciesEn,
  de: consultanciesDe,
};

export const SOFTWARE: Record<Locale, AudienceCopy> = { en: softwareEn, de: softwareDe };
