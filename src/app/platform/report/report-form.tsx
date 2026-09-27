"use client";

import { CircleCheck } from "lucide-react";
import type { ReactNode } from "react";

import { sendReportAction, type ReportState } from "@/app/platform/report/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import type { ReportCopy } from "@/core/i18n/site/report";
import { REPORT_LIMITS, REPORT_REASONS, type ReportField } from "@/core/platform/report";

/** Notice and action (DSA Art. 16): what is where, why, who reports it, in good faith. */
export function ReportForm(props: {
  labels: ReportCopy["form"];
  sent: ReportCopy["sent"];
  /** From `?url=`: the page the reporter came from. */
  url: string;
  privacyHref: string;
  /** Production without PLATFORM_ABUSE_EMAIL: the page explains the e-mail route instead. */
  disabled: boolean;
}) {
  const { labels } = props;
  const { state, pending, onSubmit } = useActionForm<ReportState>(sendReportAction, {
    status: "idle",
  });
  const errors = state.status === "error" ? state.fields : {};

  if (state.status === "sent") {
    return (
      <div className="space-y-4" role="status">
        <span className="grid size-12 place-items-center rounded-card bg-primary-soft">
          <CircleCheck aria-hidden size={24} className="text-primary" />
        </span>
        <h3 className="font-display text-2xl">{props.sent.title}</h3>
        <p>{props.sent.body.replace("{reference}", state.reference)}</p>
        <p className="text-muted">
          {state.email
            ? props.sent.confirmation.replace("{email}", state.email)
            : props.sent.anonymous}
        </p>
        <a href="/report" className="btn btn-secondary btn-sm">
          {props.sent.again}
        </a>
      </div>
    );
  }

  const described = (field: ReportField, hint?: string) =>
    [hint, errors[field] ? `report-${field}-error` : undefined].filter(Boolean).join(" ") ||
    undefined;
  const error = (field: ReportField): ReactNode =>
    errors[field] ? (
      <p
        id={`report-${field}-error`}
        className="hint font-semibold"
        style={{ color: "var(--status-critical)" }}
      >
        {errors[field]}
      </p>
    ) : null;

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="text-sm font-semibold"
          style={{ color: "var(--status-critical)" }}
        >
          {state.message}
        </p>
      )}
      <fieldset disabled={props.disabled} className="space-y-5 disabled:opacity-60">
        {/* Honeypot: hidden from people and assistive technology, filled by bots. */}
        <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Fax
            <input name="fax" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <div className="field">
          <label htmlFor="report-url" className="label">
            {labels.url}
          </label>
          <input
            id="report-url"
            name="url"
            type="url"
            inputMode="url"
            className="input"
            required
            maxLength={REPORT_LIMITS.url}
            defaultValue={props.url}
            placeholder="https://"
            aria-invalid={errors.url ? true : undefined}
            aria-describedby={described("url", "report-url-hint")}
          />
          <p id="report-url-hint" className="hint">
            {labels.urlHint}
          </p>
          {error("url")}
        </div>

        <fieldset
          className="space-y-2"
          aria-invalid={errors.reason ? true : undefined}
          aria-describedby={described("reason")}
        >
          <legend className="label mb-2">{labels.reason}</legend>
          {REPORT_REASONS.map((reason) => (
            <label key={reason} className="flex items-start gap-3">
              <input
                type="radio"
                name="reason"
                value={reason}
                required
                className="mt-1 size-4 shrink-0 accent-(--tenant-primary)"
              />
              <span>{labels.reasons[reason]}</span>
            </label>
          ))}
          {error("reason")}
        </fieldset>

        <div className="field">
          <label htmlFor="report-explanation" className="label">
            {labels.explanation}
          </label>
          <textarea
            id="report-explanation"
            name="explanation"
            className="textarea"
            required
            rows={6}
            minLength={REPORT_LIMITS.explanation.min}
            maxLength={REPORT_LIMITS.explanation.max}
            aria-invalid={errors.explanation ? true : undefined}
            aria-describedby={described("explanation", "report-explanation-hint")}
          />
          <p id="report-explanation-hint" className="hint">
            {labels.explanationHint}
          </p>
          {error("explanation")}
        </div>

        <div className="space-y-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="report-name" className="label">
                {labels.name}
              </label>
              <input
                id="report-name"
                name="name"
                className="input"
                autoComplete="name"
                maxLength={REPORT_LIMITS.name}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={described("name", "report-contact-hint")}
              />
              {error("name")}
            </div>
            <div className="field">
              <label htmlFor="report-email" className="label">
                {labels.email}
              </label>
              <input
                id="report-email"
                name="email"
                type="email"
                inputMode="email"
                className="input"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={described("email", "report-contact-hint")}
              />
              {error("email")}
            </div>
          </div>
          <p id="report-contact-hint" className="hint">
            {labels.contactHint}
          </p>
        </div>

        <div className="space-y-1">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="goodFaith"
              required
              className="mt-0.5 size-4 shrink-0 accent-(--tenant-primary)"
              aria-invalid={errors.goodFaith ? true : undefined}
              aria-describedby={described("goodFaith")}
            />
            <span>{labels.goodFaith}</span>
          </label>
          {error("goodFaith")}
        </div>

        <p className="text-sm text-muted">
          {labels.privacy.split(/(\{privacy\})/).map((part, index) =>
            part === "{privacy}" ? (
              <a key={index} href={props.privacyHref} className="underline hover:text-ink">
                {labels.privacyLink}
              </a>
            ) : (
              part
            ),
          )}
        </p>

        <SubmitButton
          pending={pending}
          pendingLabel={labels.submitting}
          className="btn btn-primary w-full"
        >
          {labels.submit}
        </SubmitButton>
      </fieldset>
    </form>
  );
}
