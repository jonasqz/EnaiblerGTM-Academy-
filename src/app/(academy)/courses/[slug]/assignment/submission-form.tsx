"use client";

import { submitAssignmentAction, type SubmitState } from "@/app/(academy)/courses/[slug]/actions";
import { useActionForm } from "@/components/ui/use-action-form";
import type { FormField } from "@/core/assignments/submission-types";

export function SubmissionForm(props: {
  slug: string;
  acceptsText: boolean;
  acceptsUrl: boolean;
  fields: FormField[] | null;
  labels: {
    text: string;
    url: string;
    submit: string;
    submitting: string;
    required: string;
    errors: Record<"empty" | "not_allowed" | "invalid" | "not_enrolled", string>;
  };
}) {
  const { state, pending, onSubmit } = useActionForm<SubmitState>(submitAssignmentAction, {
    status: "idle",
  });
  const fieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <input type="hidden" name="slug" value={props.slug} />
      {props.fields?.map((field) => (
        <label key={field.key} className="field">
          <span className="label">
            {field.title}
            {field.required && <span className="ml-1 text-muted">({props.labels.required})</span>}
          </span>
          {field.description && <span className="hint">{field.description}</span>}
          {field.multiline ? (
            <textarea
              name={`field.${field.key}`}
              className="textarea"
              maxLength={field.maxLength}
              required={field.required}
            />
          ) : (
            <input
              name={`field.${field.key}`}
              className="input"
              maxLength={field.maxLength}
              required={field.required}
            />
          )}
          {fieldErrors[field.key] && (
            <span className="hint font-semibold" style={{ color: "var(--status-critical)" }}>
              {props.labels.errors.invalid}
            </span>
          )}
        </label>
      ))}
      {props.acceptsText && (
        <label className="field">
          <span className="label">{props.labels.text}</span>
          <textarea name="text" className="textarea textarea-code min-h-72" maxLength={60000} />
        </label>
      )}
      {props.acceptsUrl && (
        <label className="field">
          <span className="label">{props.labels.url}</span>
          <input name="url" type="url" inputMode="url" className="input" placeholder="https://" />
        </label>
      )}
      {state.status === "error" && (
        <p
          role="alert"
          className="text-sm font-semibold"
          style={{ color: "var(--status-critical)" }}
        >
          {props.labels.errors[state.error]}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? props.labels.submitting : props.labels.submit}
      </button>
    </form>
  );
}
