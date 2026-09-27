"use client";

import type { ReactNode } from "react";

import { useStudioText } from "@/components/studio/studio-text";
import { COMPLETION_MODES, type CompletionMode } from "@/core/courses/completion";

/**
 * How learners finish a course (core/courses/completion), as radio cards:
 * real work (the recommendation), a final test, or both. Posts `completionMode`.
 */
export function CompletionModeChoice(props: {
  value: CompletionMode;
  onChange: (mode: CompletionMode) => void;
  /** The academy uses AI review (features.ai_review): say who reviews the work. */
  aiReview: boolean;
  hint?: ReactNode;
}) {
  const t = useStudioText();
  const body: Record<CompletionMode, string> = {
    work: t.t(
      props.aiReview ? "courses.completion.work.bodyAi" : "courses.completion.work.bodyTeam",
    ),
    test: t.t("courses.completion.test.body"),
    work_and_test: t.t("courses.completion.work_and_test.body"),
  };
  return (
    <fieldset className="field">
      <legend className="label mb-1.5">{t.t("courses.completion.title")}</legend>
      <div className="grid gap-2 md:grid-cols-3">
        {COMPLETION_MODES.map((mode) => (
          <label
            key={mode}
            className={`flex gap-3 rounded-control border p-3 ${
              props.value === mode ? "border-primary bg-primary-soft" : "border-line"
            }`}
          >
            <input
              type="radio"
              name="completionMode"
              value={mode}
              checked={props.value === mode}
              onChange={() => props.onChange(mode)}
              className="mt-1 size-4 shrink-0 accent-(--tenant-primary)"
            />
            <span>
              <span className="block text-sm font-semibold">
                {/* The name stays whole in a narrow card; the note wraps below it instead. */}
                <span className="whitespace-nowrap">{t.t(`courses.completion.${mode}`)}</span>
                {mode === "work" && (
                  <span className="ml-2 inline-block text-xs font-normal text-muted">
                    {t.t("courses.completion.recommended")}
                  </span>
                )}
              </span>
              <span className="text-xs text-muted">{body[mode]}</span>
            </span>
          </label>
        ))}
      </div>
      {props.hint}
    </fieldset>
  );
}
