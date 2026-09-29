"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { saveDetailsAction, type FormState } from "@/app/studio/actions";
import { CompletionModeChoice } from "@/components/studio/completion-mode-choice";
import { SessionRuleChoice } from "@/components/studio/session-rule-choice";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import type { DeliveryMode } from "@/core/compliance/delivery-mode";
import {
  isCompletionMode,
  requiresTest,
  requiresWork,
  type CompletionMode,
} from "@/core/courses/completion";
import { isSessionRule, type SessionRule } from "@/core/courses/sessions";
import type { Locale, LocalizedText } from "@/core/i18n/locales";
import { languageName } from "@/core/i18n/studio/helpers";

export interface DetailsFormProps {
  courseId: string;
  academyLocales: readonly Locale[];
  languages: Locale[];
  title: LocalizedText;
  summary: LocalizedText | null;
  estMinutes: number | null;
  plannedLaunch: string | null;
  slug: string;
  slugLocked: boolean;
  deliveryMode: DeliveryMode;
  completionMode: CompletionMode;
  /** Learners may be on their way: a new ending applies to those who have not finished. */
  published: boolean;
  /** Published right now: it only switches to an ending whose parts are ready. */
  live: boolean;
  aiReview: boolean;
  /** Whether the work and the test are ready for learners (no checklist errors). */
  ready: { work: boolean; test: boolean };
  /** A series: what the certificate asks of its sessions; null for a course without any. */
  sessions: {
    count: number;
    rule: SessionRule;
    /** The window field's start: the saved days, "" for no limit. */
    catchUpDays: string;
    /** The academy's threshold for a watched recording. */
    watchedPercent: number;
  } | null;
}

export function DetailsForm(props: DetailsFormProps) {
  const t = useStudioText();
  const [completionMode, setCompletionMode] = useState(props.completionMode);
  const [savedMode, setSavedMode] = useState(props.completionMode);
  const [sessionRule, setSessionRule] = useState<SessionRule>(props.sessions?.rule ?? "none");
  const [savedRule, setSavedRule] = useState<SessionRule>(props.sessions?.rule ?? "none");
  const { state, pending, onSubmit } = useActionForm<FormState>(async (previous, formData) => {
    const result = await saveDetailsAction(previous, formData);
    const saved = formData.get("completionMode");
    if (result.ok && isCompletionMode(saved)) setSavedMode(saved);
    const rule = formData.get("sessionRule");
    if (result.ok && isSessionRule(rule)) setSavedRule(rule);
    return result;
  }, {});
  // What the chosen ending adds and is not ready yet: a live course cannot switch until it is.
  const unready = {
    work: requiresWork(completionMode) && !requiresWork(savedMode) && !props.ready.work,
    test: requiresTest(completionMode) && !requiresTest(savedMode) && !props.ready.test,
  };
  // Show fields for every language the academy offers; only checked ones are saved.
  const locales = props.academyLocales;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <input type="hidden" name="courseId" value={props.courseId} />

      <section aria-labelledby="texts-heading" className="card-flat space-y-5 p-5 sm:p-6">
        <div>
          <h2 id="texts-heading" className="text-lg font-semibold">
            {t.t("courses.details.texts")}
          </h2>
          <p className="text-sm text-muted">{t.t("courses.details.textsIntro")}</p>
        </div>
        <div className={`grid gap-5 ${locales.length > 1 ? "lg:grid-cols-2" : ""}`}>
          {locales.map((locale) => (
            <div key={locale} className="space-y-4">
              <p className="eyebrow">{languageName(t, locale)}</p>
              <div className="field">
                <label htmlFor={`title.${locale}`} className="label">
                  {t.t("courses.details.title")}
                </label>
                <input
                  id={`title.${locale}`}
                  name={`title.${locale}`}
                  className="input"
                  maxLength={120}
                  defaultValue={props.title[locale] ?? ""}
                />
              </div>
              <div className="field">
                <label htmlFor={`summary.${locale}`} className="label">
                  {t.t("courses.details.summary")}
                </label>
                <textarea
                  id={`summary.${locale}`}
                  name={`summary.${locale}`}
                  className="textarea"
                  rows={4}
                  maxLength={600}
                  defaultValue={props.summary?.[locale] ?? ""}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        aria-label={t.t("courses.completion.title")}
        className="card-flat space-y-4 p-5 sm:p-6"
      >
        <CompletionModeChoice
          value={completionMode}
          onChange={setCompletionMode}
          aiReview={props.aiReview}
        />
        {props.live && (unready.work || unready.test) ? (
          <Notice tone="critical" title={t.t("courses.completion.notReadyTitle")}>
            <p>{t.t("courses.completion.notReadyBody")}</p>
            <p className="mt-2 flex flex-wrap gap-2">
              {unready.work && (
                <Link
                  href={`/studio/courses/${props.courseId}/outcome` as Route}
                  className="btn btn-secondary btn-sm"
                >
                  {t.t("courses.completion.prepareWork")}
                </Link>
              )}
              {unready.test && (
                <Link
                  href={`/studio/courses/${props.courseId}/test` as Route}
                  className="btn btn-secondary btn-sm"
                >
                  {t.t("courses.completion.prepareTest")}
                </Link>
              )}
            </p>
          </Notice>
        ) : (
          props.published &&
          (completionMode !== savedMode || sessionRule !== savedRule) && (
            <Notice tone="warning" title={t.t("courses.completion.liveTitle")}>
              {t.t("courses.completion.liveBody")}
            </Notice>
          )
        )}
        {props.sessions && (
          <SessionRuleChoice
            count={props.sessions.count}
            value={sessionRule}
            onChange={setSessionRule}
            catchUpDays={props.sessions.catchUpDays}
            watchedPercent={props.sessions.watchedPercent}
          />
        )}
      </section>

      <section
        aria-labelledby="settings-heading"
        className="card-flat grid gap-5 p-5 sm:grid-cols-2 sm:p-6"
      >
        <h2 id="settings-heading" className="text-lg font-semibold sm:col-span-2">
          {t.t("courses.details.settings")}
        </h2>
        <fieldset className="field">
          <legend className="label mb-1.5">{t.t("courses.details.languages")}</legend>
          <div className="flex flex-wrap gap-4">
            {locales.map((locale) => (
              <label key={locale} className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  name="languages"
                  value={locale}
                  defaultChecked={props.languages.includes(locale)}
                  className="size-4 accent-(--tenant-primary)"
                />
                {languageName(t, locale)}
              </label>
            ))}
          </div>
          <p className="hint">{t.t("courses.details.languagesHint")}</p>
        </fieldset>
        <div className="field">
          <label htmlFor="estMinutes" className="label">
            {t.t("courses.details.duration")}
          </label>
          <input
            id="estMinutes"
            name="estMinutes"
            type="number"
            min={1}
            max={6000}
            className="input"
            defaultValue={props.estMinutes ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="slug" className="label">
            {t.t("courses.details.address")}
          </label>
          <div className="flex items-center gap-1">
            <span className="text-muted">/courses/</span>
            <input
              id="slug"
              name="slug"
              className="input"
              maxLength={60}
              defaultValue={props.slug}
              readOnly={props.slugLocked}
              aria-describedby="slug-hint"
            />
          </div>
          <p id="slug-hint" className="hint">
            {props.slugLocked
              ? t.t("courses.details.addressLocked")
              : t.t("courses.details.addressOpen")}
          </p>
        </div>
        <div className="field">
          <label htmlFor="plannedLaunch" className="label">
            {t.t("courses.details.launch")}
          </label>
          <input
            id="plannedLaunch"
            name="plannedLaunch"
            className="input"
            placeholder="2027-01"
            pattern="\d{4}-\d{2}(-\d{2})?"
            defaultValue={props.plannedLaunch ?? ""}
          />
        </div>
        <fieldset className="field sm:col-span-2">
          <legend className="label mb-1.5">{t.t("courses.delivery.title")}</legend>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="flex items-start gap-3 rounded-control border border-line p-3">
              <input
                type="radio"
                name="deliveryMode"
                value="free_async"
                defaultChecked={props.deliveryMode === "free_async"}
                className="mt-1 size-4 accent-(--tenant-primary)"
              />
              <span>
                <span className="block font-semibold">{t.t("courses.delivery.free_async")}</span>
                <span className="text-sm text-muted">
                  {t.t("courses.delivery.free_async.body")}
                </span>
              </span>
            </label>
            {props.deliveryMode !== "free_async" ? (
              <label className="flex items-start gap-3 rounded-control border border-line p-3">
                <input
                  type="radio"
                  name="deliveryMode"
                  value={props.deliveryMode}
                  defaultChecked
                  className="mt-1 size-4 accent-(--tenant-primary)"
                />
                <span>
                  <span className="block font-semibold">
                    {t.t(`courses.delivery.${props.deliveryMode}`)}
                  </span>
                  <span className="text-sm text-muted">
                    {t.t("courses.delivery.paidFromManifest")}
                  </span>
                </span>
              </label>
            ) : (
              <p className="flex items-center rounded-control border border-dashed border-line p-3 text-sm text-muted">
                {t.t("courses.delivery.paidBlocked")}
              </p>
            )}
          </div>
        </fieldset>
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 space-y-3 border-t border-line bg-surface/95 px-4 py-4 backdrop-blur-sm sm:mx-0 sm:rounded-card sm:border">
        <FormFeedback state={state} />
        <div className="flex justify-end">
          <SubmitButton pending={pending} pendingLabel={t.t("common.saving")}>
            {t.t("courses.details.save")}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
