"use client";

import { Plus } from "lucide-react";

import type { FormState } from "@/app/studio/actions";
import { createWebinarAction } from "@/app/studio/webinars/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";

export interface LanguageOption {
  code: string;
  label: string;
}

/** Date, start and zone: the Studio enters wall-clock time where the webinar is held. */
export function WhenFields(props: {
  date?: string;
  time?: string;
  timeZone: string;
  timeZones: string[];
  durationMinutes?: number;
}) {
  const t = useStudioText();
  return (
    <>
      <div className="field">
        <label htmlFor="webinar-date" className="label">
          {t.t("webinars.field.date")}
        </label>
        <input
          id="webinar-date"
          name="date"
          type="date"
          className="input"
          defaultValue={props.date}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="webinar-time" className="label">
          {t.t("webinars.field.time")}
        </label>
        <input
          id="webinar-time"
          name="time"
          type="time"
          className="input"
          defaultValue={props.time ?? "18:00"}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="webinar-zone" className="label">
          {t.t("webinars.field.timeZone")}
        </label>
        <select
          id="webinar-zone"
          name="timeZone"
          className="select"
          defaultValue={props.timeZone}
          required
        >
          {props.timeZones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="webinar-duration" className="label">
          {t.t("webinars.field.duration")}
        </label>
        <input
          id="webinar-duration"
          name="durationMinutes"
          type="number"
          min={10}
          max={600}
          step={5}
          className="input"
          defaultValue={props.durationMinutes ?? 60}
          required
        />
      </div>
    </>
  );
}

export function NewWebinarForm(props: {
  languages: LanguageOption[];
  timeZone: string;
  timeZones: string[];
  defaultDate: string;
}) {
  const t = useStudioText();
  const { state, pending, onSubmit } = useActionForm<FormState>(createWebinarAction, {});
  return (
    <form onSubmit={onSubmit} className="card-flat space-y-4 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{t.t("webinars.new")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field sm:col-span-2">
          <label htmlFor="webinar-title" className="label">
            {t.t("webinars.field.title")}
          </label>
          <input
            id="webinar-title"
            name="title"
            className="input"
            maxLength={120}
            minLength={3}
            required
          />
        </div>
        <div className="field sm:col-span-2">
          <label htmlFor="webinar-language" className="label">
            {t.t("webinars.field.language")}
          </label>
          <select id="webinar-language" name="locale" className="select">
            {props.languages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
          <p className="hint">{t.t("webinars.field.languageHint")}</p>
        </div>
        <WhenFields
          date={props.defaultDate}
          timeZone={props.timeZone}
          timeZones={props.timeZones}
        />
      </div>
      <FormFeedback state={state} />
      <SubmitButton pending={pending} pendingLabel={t.t("webinars.creating")}>
        <Plus aria-hidden size={18} /> {t.t("webinars.create")}
      </SubmitButton>
    </form>
  );
}
