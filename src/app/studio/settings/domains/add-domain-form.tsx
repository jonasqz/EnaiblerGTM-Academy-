"use client";

import { Plus } from "lucide-react";
import { useEffect, useRef } from "react";

import type { FormState } from "@/app/studio/actions";
import { addDomainAction } from "@/app/studio/settings/domains/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";

export function AddDomainForm() {
  const { state, pending, onSubmit } = useActionForm<FormState>(addDomainAction, {});
  const form = useRef<HTMLFormElement>(null);
  // Added: the domain now has its own card; the field is free for the next one.
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} onSubmit={onSubmit} className="card-flat space-y-3 p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">Use your own domain</h2>
        <p className="text-sm text-muted">
          For example academy.your-company.com. Your academy stays reachable at its current address.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <label htmlFor="domain" className="sr-only">
          Domain
        </label>
        <input
          id="domain"
          name="domain"
          className="input min-w-60 flex-1 font-mono"
          placeholder="academy.your-company.com"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
        <SubmitButton pending={pending} pendingLabel="Adding…">
          <Plus aria-hidden size={18} /> Add domain
        </SubmitButton>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}
