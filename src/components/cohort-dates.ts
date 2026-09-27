import type { Translator } from "@/core/i18n/translator";

/** "5 Oct 2026 – 2 Nov 2026" in the learner's language, or null without dates. */
export function cohortDateLine(
  t: Translator,
  startsOn: string | null,
  endsOn: string | null,
): string | null {
  const format = (value: string) =>
    new Date(`${value}T00:00:00Z`).toLocaleDateString(t.locale === "de" ? "de-DE" : "en-GB", {
      dateStyle: "medium",
      timeZone: "UTC",
    });
  if (startsOn && endsOn)
    return t.t("cohort.runs", { start: format(startsOn), end: format(endsOn) });
  if (startsOn) return t.t("cohort.startsOn", { date: format(startsOn) });
  if (endsOn) return t.t("cohort.until", { date: format(endsOn) });
  return null;
}
