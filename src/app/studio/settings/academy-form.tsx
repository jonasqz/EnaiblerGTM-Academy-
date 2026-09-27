"use client";

import { useState } from "react";

import type { FormState } from "@/app/studio/actions";
import { saveAcademySettingsAction } from "@/app/studio/settings/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { LANGUAGE_NAMES } from "@/components/studio/language-names";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import type { Locale, LocalizedText } from "@/core/i18n/locales";
import type { Features } from "@/core/tenant/manifest";

const MODULES: Array<{ key: keyof Features; label: string; body: string }> = [
  {
    key: "ai_review",
    label: "AI review",
    body: "Hand-ins get AI feedback within minutes; your team spot-checks. Off: every hand-in waits for a person.",
  },
  {
    key: "paths",
    label: "Paths",
    body: "Ordered sets of courses learners choose as their direction. Off: a plain course catalogue.",
  },
  {
    key: "levels",
    label: "Levels",
    body: "Progress along a path earns levels, shown on certificates. Needs paths.",
  },
  {
    key: "cohorts",
    label: "Cohorts",
    body: "Groups that start a course together, with dates and mentors.",
  },
  {
    key: "showcase",
    label: "Showcase",
    body: "Learners may show an excerpt of their work on their public certificate page.",
  },
];

export function AcademyForm(props: {
  address: string;
  name: string;
  locales: readonly Locale[];
  defaultLocale: Locale;
  allLocales: readonly Locale[];
  website: string;
  /** "Name <address>" learners see on mails from the academy. */
  sender: string;
  replyTo: string;
  legalLinks: { imprint?: string; privacy?: string; terms?: string };
  ctaLabel: LocalizedText;
  features: Features;
}) {
  const { state, pending, onSubmit } = useActionForm<FormState>(saveAcademySettingsAction, {});
  const [locales, setLocales] = useState<Locale[]>([...props.locales]);
  const [defaultLocale, setDefaultLocale] = useState<Locale>(props.defaultLocale);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section
        aria-labelledby="academy-heading"
        className="card-flat grid gap-5 p-5 sm:grid-cols-2 sm:p-6"
      >
        <h2 id="academy-heading" className="text-lg font-semibold sm:col-span-2">
          Academy
        </h2>
        <div className="field">
          <label htmlFor="academy-name" className="label">
            Name
          </label>
          <input
            id="academy-name"
            name="name"
            className="input"
            required
            maxLength={80}
            defaultValue={props.name}
          />
          <p className="hint">
            A brand, never a person. It is the sender of e-mails and the issuer of certificates.
          </p>
        </div>
        <div className="field">
          <span className="label">Address</span>
          <p className="input flex items-center bg-subtle text-muted">
            {props.address.replace(/^https?:\/\//, "")}
          </p>
          <p className="hint">
            Your own domain (academy.your-company.com) can be connected on request.
          </p>
        </div>
        <fieldset className="field">
          <legend className="label mb-1.5">Languages</legend>
          <div className="flex flex-wrap gap-4">
            {props.allLocales.map((locale) => (
              <label key={locale} className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  name="locales"
                  value={locale}
                  checked={locales.includes(locale)}
                  onChange={(event) =>
                    setLocales(
                      event.target.checked
                        ? [...locales, locale]
                        : locales.filter((item) => item !== locale),
                    )
                  }
                  className="size-4 accent-(--tenant-primary)"
                />
                {LANGUAGE_NAMES[locale]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="academy-default" className="label">
            Default language
          </label>
          <select
            id="academy-default"
            name="defaultLocale"
            className="select"
            value={locales.includes(defaultLocale) ? defaultLocale : locales[0]}
            onChange={(event) => setDefaultLocale(event.target.value as Locale)}
          >
            {locales.map((locale) => (
              <option key={locale} value={locale}>
                {LANGUAGE_NAMES[locale]}
              </option>
            ))}
          </select>
        </div>
        <div className="field sm:col-span-2">
          <label htmlFor="academy-website" className="label">
            Website
          </label>
          <input
            id="academy-website"
            name="website"
            className="input"
            inputMode="url"
            placeholder="https://your-company.com"
            defaultValue={props.website}
          />
          <p className="hint">Brand import reads your colours and fonts from here.</p>
        </div>
        <div className="field sm:col-span-2">
          <label htmlFor="academy-reply-to" className="label">
            Replies go to
          </label>
          <input
            id="academy-reply-to"
            name="replyTo"
            type="email"
            className="input"
            placeholder="hello@your-company.com"
            defaultValue={props.replyTo}
          />
          <p className="hint">
            Mails to learners (sign-in links, feedback, levels) come from {props.sender}. When a
            learner replies, the answer goes to this address.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="legal-heading"
        className="card-flat grid gap-5 p-5 sm:grid-cols-3 sm:p-6"
      >
        <div className="sm:col-span-3">
          <h2 id="legal-heading" className="text-lg font-semibold">
            Legal pages
          </h2>
          <p className="text-sm text-muted">
            Your academy’s own pages, linked in its footer and e-mails. Imprint and privacy page are
            required before the first course goes live.
          </p>
        </div>
        {(
          [
            ["imprint", "Imprint", true],
            ["privacy", "Privacy policy", true],
            ["terms", "Terms (optional)", false],
          ] as const
        ).map(([key, label, required]) => (
          <div key={key} className="field">
            <label htmlFor={`legal-${key}`} className="label">
              {label}
              {required && <span className="sr-only"> (required to publish)</span>}
            </label>
            <input
              id={`legal-${key}`}
              name={key}
              className="input"
              inputMode="url"
              placeholder={`https://your-company.com/${key}`}
              defaultValue={props.legalLinks[key] ?? ""}
            />
          </div>
        ))}
      </section>

      <section
        aria-labelledby="cta-heading"
        className="card-flat grid gap-5 p-5 sm:grid-cols-2 sm:p-6"
      >
        <div className="sm:col-span-2">
          <h2 id="cta-heading" className="text-lg font-semibold">
            Button on shared certificates
          </h2>
          <p className="text-sm text-muted">
            Everyone who opens a shared Certificate of Completion sees this button; it leads into
            your academy.
          </p>
        </div>
        {locales.map((locale) => (
          <div key={locale} className="field">
            <label htmlFor={`cta-${locale}`} className="label">
              {LANGUAGE_NAMES[locale]}
            </label>
            <input
              id={`cta-${locale}`}
              name={`cta.${locale}`}
              className="input"
              maxLength={40}
              defaultValue={props.ctaLabel[locale] ?? ""}
            />
          </div>
        ))}
      </section>

      <section aria-labelledby="modules-heading" className="card-flat space-y-4 p-5 sm:p-6">
        <div>
          <h2 id="modules-heading" className="text-lg font-semibold">
            Modules
          </h2>
          <p className="text-sm text-muted">Switch parts of the academy on when you need them.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {MODULES.map((module) => (
            <label key={module.key} className="flex gap-3 rounded-control border border-line p-3">
              <input
                type="checkbox"
                name={`feature.${module.key}`}
                defaultChecked={props.features[module.key]}
                className="mt-1 size-4 shrink-0 accent-(--tenant-primary)"
              />
              <span>
                <span className="block text-sm font-semibold">{module.label}</span>
                <span className="text-xs text-muted">{module.body}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 space-y-3 border-t border-line bg-surface/95 px-4 py-4 backdrop-blur-sm sm:mx-0 sm:rounded-card sm:border">
        <FormFeedback state={state} />
        <div className="flex justify-end">
          <SubmitButton pending={pending} pendingLabel="Saving…">
            Save settings
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
