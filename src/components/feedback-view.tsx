import { localize, type Locale } from "@/core/i18n/locales";
import { scoreRange, type Rubric } from "@/core/review/rubric";
import type { ReviewCriterionResult } from "@/db/schema/learning";

/** Per-criterion scores and feedback (brief §5): what to improve, criterion by criterion. */
export function FeedbackView(props: {
  rubric: Rubric;
  criteria: ReviewCriterionResult[];
  summary: string;
  locale: Locale;
  fallback: Locale[];
}) {
  return (
    <div className="space-y-4">
      {props.summary && <p className="text-[0.9375rem]">{props.summary}</p>}
      <ul className="space-y-3">
        {props.rubric.criteria.map((criterion) => {
          const result = props.criteria.find((row) => row.criterionId === criterion.id);
          if (!result) return null;
          const { min, max } = scoreRange(criterion);
          const percent = max === min ? 100 : ((result.score - min) / (max - min)) * 100;
          const descriptor = criterion.score_descriptors.find((d) => d.score === result.score);
          return (
            <li key={criterion.id} className="rounded-control border border-line p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">
                  {localize(criterion.label, props.locale, props.fallback)}
                </p>
                <p className="text-sm font-semibold tabular-nums">
                  {result.score} / {max}
                </p>
              </div>
              <div className="progress mt-2" aria-hidden>
                <span style={{ width: `${percent}%` }} />
              </div>
              {descriptor && (
                <p className="mt-2 text-sm text-muted">
                  {localize(descriptor.description, props.locale, props.fallback)}
                </p>
              )}
              {result.feedback && <p className="mt-2 text-sm">→ {result.feedback}</p>}
              {result.evidence.filter((quote) => quote.verified).length > 0 && (
                <ul className="mt-2 space-y-1">
                  {result.evidence
                    .filter((quote) => quote.verified)
                    .map((quote) => (
                      <li
                        key={quote.quote}
                        className="border-l-2 border-line pl-3 text-sm italic text-muted"
                      >
                        “{quote.quote}”
                      </li>
                    ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
