"use client";

import { Plus } from "lucide-react";

import type { FormState } from "@/app/studio/actions";
import { createPathAction } from "@/app/studio/paths/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import type { Locale } from "@/core/i18n/locales";

export function NewPathForm(props: { locale: Locale }) {
  const { state, pending, onSubmit } = useActionForm<FormState>(createPathAction, {});
  return (
    <form onSubmit={onSubmit} className="card-flat space-y-3 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="field min-w-56 flex-1">
          <label htmlFor="new-path-title" className="label">
            New path
          </label>
          <input
            id="new-path-title"
            name={`title.${props.locale}`}
            className="input"
            required
            maxLength={60}
            placeholder="e.g. Builder"
          />
        </div>
        <SubmitButton pending={pending} pendingLabel="Adding…">
          <Plus aria-hidden size={18} /> Add path
        </SubmitButton>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}
