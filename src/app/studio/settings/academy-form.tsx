"use client";

import { useState } from "react";

import type { FormState } from "@/app/studio/actions";
import { saveAcademySettingsAction } from "@/app/studio/settings/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import type { Locale } from "@/core/i18n/locales";
import { languageName } from "@/core/i18n/studio/helpers";
import type { Features } from "@/core/tenant/manifest";

const MODULES: Array<keyof Features> = ["ai_review", "paths", "levels", "cohorts", "showcase"];

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
  features: Features;
  /** A video counts as watched once this share of it was played. */
  videoWatchedPercent: number;
}) {
  const t = useStudioText();
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
          {t.t("settings.academy.heading")}
        </h2>
        <div className="field">
          <label htmlFor="academy-name" className="label">
            {t.t("settings.academy.name")}
          </label>
          <input
            id="academy-name"
            name="name"
            className="input"
            required
            maxLength={80}
            defaultValue={props.name}
          />
          <p className="hint">{t.t("settings.academy.nameHint")}</p>
        </div>
        <div className="field">
          <span className="label">{t.t("settings.academy.address")}</span>
          <p className="input flex items-center bg-subtle text-muted">
            {props.address.replace(/^https?:\/\//, "")}
          </p>
          <p className="hint">{t.t("settings.academy.addressHint")}</p>
        </div>
        <fieldset className="field">
          <legend className="label mb-1.5">{t.t("settings.academy.languages")}</legend>
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
                {languageName(t, locale)}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="academy-default" className="label">
            {t.t("settings.academy.defaultLanguage")}
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
                {languageName(t, locale)}
              </option>
            ))}
          </select>
        </div>
        <div className="field sm:col-span-2">
          <label htmlFor="academy-website" className="label">
            {t.t("settings.academy.website")}
          </label>
          <input
            id="academy-website"
            name="website"
            className="input"
            inputMode="url"
            placeholder={t.t("settings.academy.websitePlaceholder")}
            defaultValue={props.website}
          />
          <p className="hint">{t.t("settings.academy.websiteHint")}</p>
        </div>
        <div className="field sm:col-span-2">
          <label htmlFor="academy-reply-to" className="label">
            {t.t("settings.academy.replyTo")}
          </label>
          <input
            id="academy-reply-to"
            name="replyTo"
            type="email"
            className="input"
            placeholder={t.t("settings.academy.replyToPlaceholder")}
            defaultValue={props.replyTo}
          />
          <p className="hint">{t.t("settings.academy.replyToHint", { sender: props.sender })}</p>
        </div>
      </section>

      <section
        aria-labelledby="legal-heading"
        className="card-flat grid gap-5 p-5 sm:grid-cols-3 sm:p-6"
      >
        <div className="sm:col-span-3">
          <h2 id="legal-heading" className="text-lg font-semibold">
            {t.t("settings.legal.heading")}
          </h2>
          <p className="text-sm text-muted">{t.t("settings.legal.intro")}</p>
        </div>
        {(
          [
            ["imprint", true],
            ["privacy", true],
            ["terms", false],
          ] as const
        ).map(([key, required]) => (
          <div key={key} className="field">
            <label htmlFor={`legal-${key}`} className="label">
              {t.t(`settings.legal.${key}`)}
              {required && <span className="sr-only"> {t.t("settings.legal.required")}</span>}
            </label>
            <input
              id={`legal-${key}`}
              name={key}
              className="input"
              inputMode="url"
              placeholder={t.t(`settings.legal.${key}Placeholder`)}
              defaultValue={props.legalLinks[key] ?? ""}
            />
          </div>
        ))}
      </section>

      <section aria-labelledby="modules-heading" className="card-flat space-y-4 p-5 sm:p-6">
        <div>
          <h2 id="modules-heading" className="text-lg font-semibold">
            {t.t("settings.modules.heading")}
          </h2>
          <p className="text-sm text-muted">{t.t("settings.modules.intro")}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {MODULES.map((module) => (
            <label key={module} className="flex gap-3 rounded-control border border-line p-3">
              <input
                type="checkbox"
                name={`feature.${module}`}
                defaultChecked={props.features[module]}
                className="mt-1 size-4 shrink-0 accent-(--tenant-primary)"
              />
              <span>
                <span className="block text-sm font-semibold">
                  {t.t(`settings.module.${module}.label`)}
                </span>
                <span className="text-xs text-muted">{t.t(`settings.module.${module}.body`)}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section aria-labelledby="videos-heading" className="card-flat space-y-4 p-5 sm:p-6">
        <h2 id="videos-heading" className="text-lg font-semibold">
          {t.t("media.settings.heading")}
        </h2>
        <div className="field max-w-md">
          <label htmlFor="academy-video-watched" className="label">
            {t.t("media.settings.threshold")}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="academy-video-watched"
              name="videoWatchedPercent"
              type="number"
              inputMode="numeric"
              min={10}
              max={100}
              step={1}
              required
              className="input w-24"
              defaultValue={props.videoWatchedPercent}
              aria-describedby="academy-video-watched-hint"
            />
            <span aria-hidden>%</span>
          </div>
          <p id="academy-video-watched-hint" className="hint">
            {t.t("media.settings.thresholdHint")}
          </p>
        </div>
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 space-y-3 border-t border-line bg-surface/95 px-4 py-4 backdrop-blur-sm sm:mx-0 sm:rounded-card sm:border">
        <FormFeedback state={state} />
        <div className="flex justify-end">
          <SubmitButton pending={pending} pendingLabel={t.t("common.saving")}>
            {t.t("settings.academy.save")}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
