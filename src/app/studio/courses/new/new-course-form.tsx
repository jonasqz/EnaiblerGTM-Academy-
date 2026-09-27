"use client";

import { useState } from "react";

import { createCourseAction, type FormState } from "@/app/studio/actions";
import { CompletionModeChoice } from "@/components/studio/completion-mode-choice";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import { requiresTest, requiresWork, type CompletionMode } from "@/core/courses/completion";
import type { Locale } from "@/core/i18n/locales";
import { languageName } from "@/core/i18n/studio/helpers";

type Step = "outcome" | "rubric" | "test" | "lessons" | "details" | "publish";

/** The build steps that follow from how the course ends; the first is where creating leads. */
function stepsFor(mode: CompletionMode): Step[] {
  return [
    ...(requiresWork(mode) ? (["outcome", "rubric"] as const) : []),
    ...(requiresTest(mode) ? (["test"] as const) : []),
    "lessons",
    "details",
    "publish",
  ];
}

const DRAFT_NOTE = {
  work: "courses.new.draftNote",
  test: "courses.new.draftNoteTest",
  work_and_test: "courses.new.draftNoteBoth",
} as const;

/** The form and, beside it, the steps it starts (the page lays both out as a grid). */
export function NewCourseForm(props: {
  locales: readonly Locale[];
  artifactTerm: string;
  aiReview: boolean;
}) {
  const { state, pending, onSubmit } = useActionForm<FormState>(createCourseAction, {});
  const t = useStudioText();
  const [mode, setMode] = useState<CompletionMode>("work");
  const work = requiresWork(mode);
  const steps = stepsFor(mode);

  return (
    <>
      <form onSubmit={onSubmit} className="card space-y-6 p-5 sm:p-8">
        <FormFeedback state={state} />

        <CompletionModeChoice
          value={mode}
          onChange={setMode}
          aiReview={props.aiReview}
          hint={<p className="hint">{t.t("courses.completion.hint")}</p>}
        />

        {/*
          Only work has an artifact. Hidden and disabled for a test, not removed:
          disabled fields are neither required nor sent, and what was typed stays
          for switching back.
        */}
        <div hidden={!work} className="space-y-6">
          <div className="field">
            <label htmlFor="artifactName" className="label">
              {t.t("courses.new.artifact")}
            </label>
            <input
              id="artifactName"
              name="artifactName"
              className="input"
              required
              disabled={!work}
              maxLength={80}
              placeholder={t.t("courses.new.artifactPlaceholder")}
              aria-describedby="artifactName-hint"
            />
            <p id="artifactName-hint" className="hint">
              {t.t("courses.new.artifactHint", { term: props.artifactTerm })}
            </p>
          </div>

          <div className="field">
            <label htmlFor="outcome" className="label">
              {t.t("courses.new.outcome")}
            </label>
            <textarea
              id="outcome"
              name="outcome"
              className="textarea"
              required
              disabled={!work}
              minLength={20}
              maxLength={4000}
              rows={6}
              placeholder={t.t("courses.new.outcomePlaceholder")}
              aria-describedby="outcome-hint"
            />
            <p id="outcome-hint" className="hint">
              {t.t("courses.new.outcomeHint")}
            </p>
          </div>
        </div>

        <div className="field">
          <label htmlFor="title" className="label">
            {t.t("courses.new.courseTitle")}
          </label>
          <input
            id="title"
            name="title"
            className="input"
            required
            minLength={3}
            maxLength={120}
            placeholder={t.t("courses.new.courseTitlePlaceholder")}
          />
        </div>

        <fieldset className="field">
          <legend className="label mb-1.5">{t.t("courses.new.languages")}</legend>
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
                {languageName(t, locale)}
              </label>
            ))}
          </div>
          <p className="hint">{t.t("courses.new.languagesHint")}</p>
        </fieldset>

        <fieldset className="field">
          <legend className="label mb-1.5">{t.t("courses.delivery.title")}</legend>
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
                <span className="block font-semibold">{t.t("courses.delivery.free_async")}</span>
                <span className="text-sm text-muted">
                  {t.t("courses.delivery.free_async.body")}
                </span>
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
                <span className="block font-semibold">{t.t("courses.delivery.paid")}</span>
                <span className="text-sm text-muted">{t.t("courses.delivery.paid.body")}</span>
              </span>
            </label>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <p className="text-sm text-muted">{t.t(DRAFT_NOTE[mode])}</p>
          <SubmitButton pending={pending} pendingLabel={t.t("courses.new.creating")}>
            {t.t("courses.new.create")}
          </SubmitButton>
        </div>
      </form>

      <aside aria-label={t.t("courses.new.steps")} className="lg:pt-2">
        <ol className="space-y-4">
          {steps.map((step, index) => {
            const current = index === 0;
            return (
              <li key={step} className="flex gap-3">
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                    current ? "bg-primary text-on-primary" : "bg-subtle text-muted"
                  }`}
                  aria-hidden
                >
                  {index + 1}
                </span>
                <span>
                  <span className={`block text-sm font-semibold ${current ? "" : "text-muted"}`}>
                    {t.t(`courses.step.${step}`)}
                    {current && <span className="sr-only"> {t.t("courses.new.thisStep")}</span>}
                  </span>
                  <span className="text-sm text-muted">{t.t(`courses.new.step.${step}`)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </aside>
    </>
  );
}
