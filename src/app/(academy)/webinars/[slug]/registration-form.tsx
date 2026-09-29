"use client";

import { MailCheck } from "lucide-react";

import { registerAction, type RegisterState } from "@/app/(academy)/webinars/[slug]/actions";
import { useActionForm } from "@/components/ui/use-action-form";
import { FormFieldsView, type FormLabels } from "@/components/webinars/form-fields";
import type { RegistrationForm as FormDefinition } from "@/core/webinars/landing";

/**
 * The registration form on the landing page and in the embed. Sent, it says
 * where the confirmation link went; nothing is reserved before the click.
 */
export function RegistrationForm(props: {
  slug: string;
  form: FormDefinition;
  labels: FormLabels;
  contentLocale: string;
  /** Signed-in learners register as themselves: no name or address to type. */
  signedIn: boolean;
  waitlist: boolean;
  ctx: string | null;
  privacyUrl?: string;
  embedded?: boolean;
}) {
  const { labels } = props;
  const { state, pending, onSubmit } = useActionForm<RegisterState>(registerAction, {
    status: "idle",
  });

  if (state.status === "sent") {
    return (
      <div role="status" className="flex gap-3 rounded-card bg-primary-soft p-5">
        <MailCheck aria-hidden size={22} className="mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold">{labels.sent.replace("{email}", state.email)}</p>
          <p className="text-sm">{labels.sentHint}</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="slug" value={props.slug} />
      {props.ctx && <input type="hidden" name="ctx" value={props.ctx} />}
      {props.embedded && <input type="hidden" name="embedded" value="1" />}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {props.signedIn && labels.signedInAs && <p className="text-sm">{labels.signedInAs}</p>}
      <FormFieldsView
        form={props.form}
        labels={labels}
        contentLocale={props.contentLocale}
        signedIn={props.signedIn}
        privacyUrl={props.privacyUrl}
        errors={state.status === "error" ? state.fields : undefined}
        idPrefix={props.embedded ? "embed" : "webinar"}
      />
      {state.status === "error" && state.message && (
        <p role="alert" className="text-sm font-semibold">
          {state.message}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? labels.sending : props.waitlist ? labels.submitWaitlist : labels.submit}
      </button>
    </form>
  );
}
