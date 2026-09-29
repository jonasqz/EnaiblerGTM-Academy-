"use client";

import { useState } from "react";

import type { FormState } from "@/app/studio/actions";
import { updateSetupAction } from "@/app/studio/webinars/actions";
import { WhenFields, type LanguageOption } from "@/app/studio/webinars/forms";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";

export interface SetupValues {
  webinarId: string;
  slug: string;
  slugLocked: boolean;
  locale: string;
  title: string;
  description: string;
  date: string;
  time: string;
  timeZone: string;
  durationMinutes: number;
  capacity: number | null;
  joinUrl: string;
  courseId: string;
  recorded: boolean;
  recordingNotice: string;
}

/** Everything about when, where and for whom (webinar brief §2.2, session setup). */
export function SetupForm(props: {
  values: SetupValues;
  languages: LanguageOption[];
  courses: Array<{ id: string; label: string }>;
  timeZones: string[];
}) {
  const t = useStudioText();
  const { values } = props;
  const { state, pending, onSubmit } = useActionForm<FormState>(updateSetupAction, {});
  const [recorded, setRecorded] = useState(values.recorded);
  const [slug, setSlug] = useState(values.slug);
  return (
    <form onSubmit={onSubmit} className="card-flat max-w-3xl space-y-5 p-5 sm:p-6">
      <input type="hidden" name="webinarId" value={values.webinarId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field sm:col-span-2">
          <label htmlFor="setup-title" className="label">
            {t.t("webinars.field.title")}
          </label>
          <input
            id="setup-title"
            name="title"
            className="input"
            defaultValue={values.title}
            minLength={3}
            maxLength={120}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="setup-language" className="label">
            {t.t("webinars.field.language")}
          </label>
          <select id="setup-language" name="locale" className="select" defaultValue={values.locale}>
            {props.languages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
          <p className="hint">{t.t("webinars.field.languageHint")}</p>
        </div>
        <div className="field">
          <label htmlFor="setup-slug" className="label">
            {t.t("webinars.field.slug")}
          </label>
          <input
            id="setup-slug"
            name="slug"
            className="input font-mono"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            readOnly={values.slugLocked}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={64}
            required
          />
          <p className="hint">{t.t("webinars.field.slugHint", { slug: slug || "…" })}</p>
        </div>
        <div className="field sm:col-span-2">
          <label htmlFor="setup-description" className="label">
            {t.t("webinars.field.description")}
          </label>
          <textarea
            id="setup-description"
            name="description"
            className="textarea"
            rows={5}
            maxLength={4000}
            defaultValue={values.description}
          />
          <p className="hint">{t.t("webinars.field.descriptionHint")}</p>
        </div>
        <WhenFields
          date={values.date}
          time={values.time}
          timeZone={values.timeZone}
          timeZones={props.timeZones}
          durationMinutes={values.durationMinutes}
        />
        <div className="field">
          <label htmlFor="setup-capacity" className="label">
            {t.t("webinars.field.capacity")}
          </label>
          <input
            id="setup-capacity"
            name="capacity"
            type="number"
            min={1}
            className="input"
            defaultValue={values.capacity ?? ""}
          />
          <p className="hint">{t.t("webinars.field.capacityHint")}</p>
        </div>
        <div className="field">
          <label htmlFor="setup-tool" className="label">
            {t.t("webinars.field.tool")}
          </label>
          <select id="setup-tool" name="tool" className="select" defaultValue="link" disabled>
            <option value="link">{t.t("webinars.field.tool.link")}</option>
          </select>
          <p className="hint">{t.t("webinars.field.toolHint")}</p>
        </div>
        <div className="field sm:col-span-2">
          <label htmlFor="setup-join" className="label">
            {t.t("webinars.field.joinUrl")}
          </label>
          <input
            id="setup-join"
            name="joinUrl"
            type="url"
            inputMode="url"
            className="input"
            placeholder="https://"
            defaultValue={values.joinUrl}
          />
          <p className="hint">{t.t("webinars.field.joinUrlHint")}</p>
        </div>
        <div className="field sm:col-span-2">
          <label htmlFor="setup-course" className="label">
            {t.t("webinars.field.course")}
          </label>
          <select
            id="setup-course"
            name="courseId"
            className="select"
            defaultValue={values.courseId}
          >
            <option value="">{t.t("webinars.field.courseNone")}</option>
            {props.courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.label}
              </option>
            ))}
          </select>
          <p className="hint">{t.t("webinars.field.courseHint")}</p>
        </div>
        <div className="space-y-3 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              name="recorded"
              checked={recorded}
              onChange={(event) => setRecorded(event.target.checked)}
              className="size-4"
            />
            {t.t("webinars.field.recorded")}
          </label>
          {recorded && (
            <div className="field">
              <label htmlFor="setup-notice" className="label">
                {t.t("webinars.field.recordingNotice")}
              </label>
              <textarea
                id="setup-notice"
                name="recordingNotice"
                className="textarea"
                rows={3}
                maxLength={600}
                defaultValue={values.recordingNotice}
              />
              <p className="hint">{t.t("webinars.field.recordingNoticeHint")}</p>
            </div>
          )}
        </div>
      </div>
      <FormFeedback state={state} />
      <SubmitButton pending={pending} pendingLabel={t.t("common.saving")}>
        {t.t("webinars.save")}
      </SubmitButton>
    </form>
  );
}
