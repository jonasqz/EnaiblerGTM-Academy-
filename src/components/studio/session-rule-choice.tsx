"use client";

import { useStudioText } from "@/components/studio/studio-text";
import { MAX_CATCH_UP_DAYS, SESSION_RULES, type SessionRule } from "@/core/courses/sessions";

/**
 * What the certificate of a series asks of its live sessions
 * (core/courses/sessions), next to how the course ends: nothing, every
 * session live, or live or as recording within a catch-up window. Posts
 * `sessionRule` and `catchUpDays`.
 */
export function SessionRuleChoice(props: {
  count: number;
  value: SessionRule;
  onChange: (rule: SessionRule) => void;
  /** What the window field starts with: the saved days, "" for no limit. */
  catchUpDays: string;
  watchedPercent: number;
}) {
  const t = useStudioText();
  const body: Record<SessionRule, string> = {
    none: t.t("series.rule.none.body"),
    attended: t.t("series.rule.attended.body"),
    attended_or_watched: t.t("series.rule.attended_or_watched.body", {
      percent: props.watchedPercent,
    }),
  };
  // Stricter to the right, like the course endings.
  const order: SessionRule[] = ["none", "attended_or_watched", "attended"];
  return (
    <fieldset className="field border-t border-line pt-4">
      <legend className="label mb-1.5">{t.t("series.rule.title")}</legend>
      <p className="mb-3 text-sm text-muted">{t.n("series.rule.intro", props.count)}</p>
      <div className="grid gap-2 md:grid-cols-3">
        {order
          .filter((rule) => SESSION_RULES.includes(rule))
          .map((rule) => (
            <label
              key={rule}
              className={`flex gap-3 rounded-control border p-3 ${
                props.value === rule ? "border-primary bg-primary-soft" : "border-line"
              }`}
            >
              <input
                type="radio"
                name="sessionRule"
                value={rule}
                checked={props.value === rule}
                onChange={() => props.onChange(rule)}
                className="mt-1 size-4 shrink-0 accent-(--tenant-primary)"
              />
              <span>
                <span className="block text-sm font-semibold">{t.t(`series.rule.${rule}`)}</span>
                <span className="text-xs text-muted">{body[rule]}</span>
              </span>
            </label>
          ))}
      </div>
      {props.value === "attended_or_watched" && (
        <div className="field mt-3 max-w-xs">
          <label htmlFor="catchUpDays" className="label">
            {t.t("series.rule.catchUp")}
          </label>
          <input
            id="catchUpDays"
            name="catchUpDays"
            type="number"
            min={1}
            max={MAX_CATCH_UP_DAYS}
            className="input"
            defaultValue={props.catchUpDays}
            aria-describedby="catchUpDays-hint"
          />
          <p id="catchUpDays-hint" className="hint">
            {t.t("series.rule.catchUpHint")}
          </p>
        </div>
      )}
    </fieldset>
  );
}
