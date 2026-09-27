"use client";

import { CircleCheck, RotateCcw } from "lucide-react";
import { useState } from "react";

import { decideReviewAction, type FormState } from "@/app/studio/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import { scoreRubric, type Rubric } from "@/core/review/rubric";

const SUBMIT_LABELS = {
  decide: "Release to learner",
  check: "Save the check",
  change: "Change the decision",
} as const;

export interface DecisionCriterion {
  id: string;
  label: string;
  description: string;
  levels: Array<{ score: number; description: string }>;
}

export function DecisionForm(props: {
  submissionId: string;
  rubric: Rubric;
  criteria: DecisionCriterion[];
  initialScores: Record<string, number>;
  initialFeedback: Record<string, string>;
  initialSummary: string;
  /** The AI verdict, if there is one: a different human verdict needs a reason. */
  aiPass: boolean | null;
  learnerLanguage: string;
  /** decide: held, the learner waits · check: released, a spot check · change: a human already decided. */
  mode: "decide" | "check" | "change";
}) {
  const { state, pending, onSubmit } = useActionForm<FormState>(decideReviewAction, {});
  const [scores, setScores] = useState<Record<string, number>>(props.initialScores);
  const complete = props.criteria.every((criterion) => scores[criterion.id] !== undefined);
  const result = complete ? scoreRubric(props.rubric, scores) : null;
  const disagrees = result !== null && props.aiPass !== null && result.pass !== props.aiPass;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <input type="hidden" name="submissionId" value={props.submissionId} />
      <p className="text-sm text-muted">
        Feedback goes to the learner as written: write it in {props.learnerLanguage}. Pass or fail
        follows from the scores.
      </p>

      {props.criteria.map((criterion) => (
        <fieldset key={criterion.id} className="card-flat space-y-3 p-4">
          <legend className="sr-only">{criterion.label}</legend>
          <div>
            <p className="font-semibold">{criterion.label}</p>
            <p className="text-sm text-muted">{criterion.description}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {criterion.levels.map((level) => {
              const checked = scores[criterion.id] === level.score;
              return (
                <label
                  key={level.score}
                  className={`flex gap-3 rounded-control border p-3 text-sm ${checked ? "border-primary bg-primary-soft" : "border-line"}`}
                >
                  <input
                    type="radio"
                    name={`score.${criterion.id}`}
                    value={level.score}
                    checked={checked}
                    required
                    onChange={() => setScores({ ...scores, [criterion.id]: level.score })}
                    className="mt-0.5 size-4 shrink-0 accent-(--tenant-primary)"
                  />
                  <span>
                    <span className="font-semibold tabular-nums">{level.score}</span> ·{" "}
                    {level.description}
                  </span>
                </label>
              );
            })}
          </div>
          <label className="field">
            <span className="text-sm font-semibold">Feedback on this criterion</span>
            <textarea
              name={`feedback.${criterion.id}`}
              className="textarea min-h-0"
              rows={2}
              maxLength={2000}
              defaultValue={props.initialFeedback[criterion.id] ?? ""}
              placeholder="One concrete improvement, quoting their work where you can."
            />
          </label>
        </fieldset>
      ))}

      <label className="field">
        <span className="label">Summary for the learner</span>
        <textarea
          name="summary"
          className="textarea"
          rows={3}
          maxLength={2000}
          defaultValue={props.initialSummary}
        />
      </label>

      {disagrees && (
        <label className="field">
          <span className="label">Why your verdict differs from the AI</span>
          <textarea
            name="reason"
            className="textarea"
            rows={2}
            required
            maxLength={1000}
            placeholder="Kept for the audit trail and the agreement rate; the learner does not see it."
          />
        </label>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 space-y-3 border-t border-line bg-surface/95 px-4 py-4 backdrop-blur-sm sm:mx-0 sm:rounded-card sm:border">
        <FormFeedback state={state} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm" aria-live="polite">
            {result ? (
              <>
                {result.pass ? (
                  <CircleCheck aria-hidden size={18} style={{ color: "var(--status-good)" }} />
                ) : (
                  <RotateCcw aria-hidden size={18} className="text-muted" />
                )}
                <span className="font-semibold tabular-nums">{result.percent} %</span>
                <span>{result.pass ? "passes" : "needs revision"}</span>
                <span className="text-muted">(pass at {props.rubric.pass_threshold} %)</span>
              </>
            ) : (
              <span className="text-muted">Score every criterion.</span>
            )}
          </p>
          <SubmitButton pending={pending} pendingLabel="Saving…" disabled={!complete}>
            {SUBMIT_LABELS[props.mode]}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
