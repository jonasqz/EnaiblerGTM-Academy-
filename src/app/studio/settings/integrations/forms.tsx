"use client";

import { KeyRound, Upload } from "lucide-react";

import {
  createApiKeyAction,
  importCredentialsAction,
  type ImportState,
  type NewKeyState,
} from "@/app/studio/settings/integrations/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";

export function NewApiKeyForm() {
  const { state, pending, onSubmit } = useActionForm<NewKeyState>(createApiKeyAction, {});
  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
        <label htmlFor="key-name" className="sr-only">
          Key name
        </label>
        <input
          id="key-name"
          name="name"
          className="input min-w-60 flex-1"
          placeholder="e.g. Migration from our old platform"
          maxLength={80}
        />
        <SubmitButton pending={pending} pendingLabel="Creating…" className="btn btn-secondary">
          <KeyRound aria-hidden size={18} /> Create key
        </SubmitButton>
      </form>
      <FormFeedback state={{ errors: state.errors }} />
      {state.key && (
        <Notice tone="good" title="Copy the key now: it is shown only once.">
          <code className="block break-all rounded-control bg-subtle p-2 font-mono text-sm">
            {state.key}
          </code>
        </Notice>
      )}
    </div>
  );
}

const REASONS: Record<string, string> = {
  unknown_course: "no course with this slug",
  unknown_path: "no path with this slug",
  wording: "the artifact name uses certification wording",
  course_done: "the learner already has a certificate for this course",
  public_id_taken: "the credential id is taken",
};

export function ImportForm() {
  const { state, pending, onSubmit } = useActionForm<ImportState>(importCredentialsAction, {});
  const results = state.results ?? [];
  const count = (status: string) => results.filter((result) => result.status === status).length;
  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
        <label htmlFor="import-file" className="sr-only">
          JSON file
        </label>
        <input
          id="import-file"
          name="file"
          type="file"
          accept=".json,application/json"
          className="input min-w-60 flex-1"
          required
        />
        <SubmitButton pending={pending} pendingLabel="Importing…" className="btn btn-secondary">
          <Upload aria-hidden size={18} /> Import
        </SubmitButton>
      </form>
      <FormFeedback state={{ errors: state.errors }} />
      {results.length > 0 && (
        <Notice
          tone={count("failed") > 0 ? "warning" : "good"}
          title={`${count("imported")} imported · ${count("exists")} already here · ${count("failed")} not imported`}
        >
          {count("failed") > 0 && (
            <ul className="list-disc space-y-1 pl-4">
              {results
                .filter((result) => result.status === "failed")
                .slice(0, 20)
                .map((result) => (
                  <li key={result.external_id}>
                    <span className="font-mono">{result.external_id}</span>:{" "}
                    {result.status === "failed" ? REASONS[result.reason] : ""}
                  </li>
                ))}
            </ul>
          )}
        </Notice>
      )}
    </div>
  );
}
