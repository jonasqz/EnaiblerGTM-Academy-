import type { Locale, LocalizedText } from "@/core/i18n/locales";
import { rubricSchema, type Rubric } from "@/core/review/rubric";

/**
 * Starting point for a new course's rubric (outcome-first authoring, brief
 * §7): three generic criteria the author then rewrites for their artifact.
 * Platform default, not tenant content.
 */
function text(en: string, de: string, languages: readonly Locale[]): LocalizedText {
  const all: LocalizedText = { en, de };
  return Object.fromEntries(languages.map((locale) => [locale, all[locale]])) as LocalizedText;
}

export function starterRubric(languages: readonly Locale[]): Rubric {
  const t = (en: string, de: string) => text(en, de, languages);
  return rubricSchema.parse({
    pass_threshold: 60,
    criteria: [
      {
        id: "complete",
        label: t("Complete", "Vollständig"),
        description: t(
          "The work contains every part the assignment asks for.",
          "Die Arbeit enthält alle Teile, die die Aufgabe verlangt.",
        ),
        weight: 2,
        score_descriptors: [
          { score: 0, description: t("Major parts are missing.", "Wichtige Teile fehlen.") },
          { score: 1, description: t("Some parts are missing.", "Einige Teile fehlen.") },
          { score: 2, description: t("All parts, some thin.", "Alle Teile, manche dünn.") },
          {
            score: 3,
            description: t("All parts, each worked out.", "Alle Teile, jeweils ausgearbeitet."),
          },
        ],
      },
      {
        id: "evidence",
        label: t("Evidence and reasoning", "Belege und Begründung"),
        description: t(
          "Claims are backed by evidence, examples or data.",
          "Aussagen sind mit Belegen, Beispielen oder Daten gestützt.",
        ),
        weight: 2,
        score_descriptors: [
          { score: 0, description: t("Opinions only.", "Nur Meinungen.") },
          { score: 1, description: t("Little evidence.", "Wenig Belege.") },
          {
            score: 2,
            description: t("Most claims are backed.", "Die meisten Aussagen sind belegt."),
          },
          {
            score: 3,
            description: t("Every key claim is backed.", "Jede zentrale Aussage ist belegt."),
          },
        ],
      },
      {
        id: "clarity",
        label: t("Clarity", "Klarheit"),
        description: t(
          "Someone new to the topic can follow it and act on it.",
          "Jemand ohne Vorwissen kann folgen und danach handeln.",
        ),
        weight: 1,
        score_descriptors: [
          { score: 0, description: t("Hard to follow.", "Schwer nachvollziehbar.") },
          { score: 1, description: t("Understandable with effort.", "Mit Mühe verständlich.") },
          { score: 2, description: t("Clear.", "Klar.") },
          { score: 3, description: t("Clear and ready to act on.", "Klar und direkt umsetzbar.") },
        ],
      },
    ],
  });
}
