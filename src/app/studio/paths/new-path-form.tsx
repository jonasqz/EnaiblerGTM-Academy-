"use client";

import { Plus } from "lucide-react";

import type { FormState } from "@/app/studio/actions";
import { createPathAction } from "@/app/studio/paths/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import type { Locale } from "@/core/i18n/locales";

export function NewPathForm(props: { locale: Locale }) {
  const t = useStudioText();
  const { state, pending, onSubmit } = useActionForm<FormState>(createPathAction, {});
  return (
    <form onSubmit={onSubmit} className="card-flat space-y-3 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="field min-w-56 flex-1">
          <label htmlFor="new-path-title" className="label">
            {t.t("team.paths.new")}
          </label>
          <input
            id="new-path-title"
            name={`title.${props.locale}`}
            className="input"
            required
            maxLength={60}
            placeholder={t.t("team.paths.newPlaceholder")}
          />
        </div>
        <SubmitButton pending={pending} pendingLabel={t.t("common.adding")}>
          <Plus aria-hidden size={18} /> {t.t("team.paths.add")}
        </SubmitButton>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}
