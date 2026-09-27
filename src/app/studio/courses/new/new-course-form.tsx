"use client";

import { createCourseAction, type FormState } from "@/app/studio/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { LANGUAGE_NAMES } from "@/components/studio/language-names";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import type { Locale } from "@/core/i18n/locales";

export function NewCourseForm(props: { locales: readonly Locale[]; artifactTerm: string }) {
  const { state, pending, onSubmit } = useActionForm<FormState>(createCourseAction, {});
  return (
    <form onSubmit={onSubmit} className="card space-y-6 p-5 sm:p-8">
      <FormFeedback state={state} />

      <div className="field">
        <label htmlFor="artifactName" className="label">
          What do learners build?
        </label>
        <input
          id="artifactName"
          name="artifactName"
          className="input"
          required
          maxLength={80}
          placeholder="e.g. Validated idea brief"
          aria-describedby="artifactName-hint"
        />
        <p id="artifactName-hint" className="hint">
          The one piece of work that proves the skill. Learners see it as their “
          {props.artifactTerm}”; it is named on the Certificate of Completion.
        </p>
      </div>

      <div className="field">
        <label htmlFor="outcome" className="label">
          What does a good result look like?
        </label>
        <textarea
          id="outcome"
          name="outcome"
          className="textarea"
          required
          minLength={20}
          maxLength={4000}
          rows={6}
          placeholder="Write a one-page brief for your product idea: the problem, who has it, the evidence you collected and the riskiest assumption you will test next."
          aria-describedby="outcome-hint"
        />
        <p id="outcome-hint" className="hint">
          This becomes the assignment learners get. Be concrete: parts, evidence, length. You can
          refine it later.
        </p>
      </div>

      <div className="field">
        <label htmlFor="title" className="label">
          Course title
        </label>
        <input
          id="title"
          name="title"
          className="input"
          required
          minLength={3}
          maxLength={120}
          placeholder="e.g. Write a validated idea brief"
        />
      </div>

      <fieldset className="field">
        <legend className="label mb-1.5">Languages</legend>
        <div className="flex flex-wrap gap-4">
          {props.locales.map((locale) => (
            <label key={locale} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                name="languages"
                value={locale}
                defaultChecked
                className="size-4 accent-(--tenant-primary)"
              />
              {LANGUAGE_NAMES[locale]}
            </label>
          ))}
        </div>
        <p className="hint">
          Texts you write now go into the first language. The publish checklist asks for the others.
        </p>
      </fieldset>

      <fieldset className="field">
        <legend className="label mb-1.5">Delivery</legend>
        <div className="grid gap-2">
          <label className="flex items-start gap-3 rounded-control border border-line p-3">
            <input
              type="radio"
              name="deliveryMode"
              value="free_async"
              defaultChecked
              className="mt-1 size-4 accent-(--tenant-primary)"
            />
            <span>
              <span className="block font-semibold">Free, self-paced</span>
              <span className="text-sm text-muted">Learners start any time.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-control border border-line p-3 opacity-60">
            <input
              type="radio"
              name="deliveryMode"
              value="paid_live"
              disabled
              className="mt-1 size-4"
            />
            <span>
              <span className="block font-semibold">Paid</span>
              <span className="text-sm text-muted">
                Blocked until payments ship (FernUSG rules apply).
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <p className="text-sm text-muted">
          Creates a draft with a starter rubric. Nothing is public yet.
        </p>
        <SubmitButton pending={pending} pendingLabel="Creating…">
          Create course
        </SubmitButton>
      </div>
    </form>
  );
}
