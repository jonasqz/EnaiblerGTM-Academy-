"use client";

import { CircleCheck } from "lucide-react";

import { checkInAction, type CheckInState } from "@/app/(academy)/webinars/[slug]/actions";
import { useActionForm } from "@/components/ui/use-action-form";

/** The field for the code the host shows during the session. */
export function CheckInForm(props: {
  slug: string;
  labels: {
    title: string;
    body: string;
    label: string;
    submit: string;
    done: string;
    wrong: string;
    tooMany: string;
    closed: string;
  };
}) {
  const { labels } = props;
  const { state, pending, onSubmit } = useActionForm<CheckInState>(checkInAction, {
    status: "idle",
  });
  if (state.status === "done" || state.status === "already") {
    return (
      <p role="status" className="flex items-center gap-2 font-semibold">
        <CircleCheck aria-hidden size={20} /> {labels.done}
      </p>
    );
  }
  const problem =
    state.status === "wrong"
      ? labels.wrong
      : state.status === "too_many"
        ? labels.tooMany
        : state.status === "closed" || state.status === "not_registered"
          ? labels.closed
          : null;
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-card border border-line p-4">
      <input type="hidden" name="slug" value={props.slug} />
      <p className="font-semibold">{labels.title}</p>
      <p className="text-sm text-muted">{labels.body}</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="field min-w-0 flex-1">
          <label htmlFor="checkin-code" className="label">
            {labels.label}
          </label>
          <input
            id="checkin-code"
            name="code"
            className="input font-mono text-lg tracking-widest uppercase"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            required
            aria-invalid={Boolean(problem) || undefined}
            aria-describedby={problem ? "checkin-error" : undefined}
          />
        </div>
        <button type="submit" className="btn btn-secondary" disabled={pending}>
          {labels.submit}
        </button>
      </div>
      {problem && (
        <p id="checkin-error" role="alert" className="text-sm font-semibold">
          {problem}
        </p>
      )}
    </form>
  );
}
