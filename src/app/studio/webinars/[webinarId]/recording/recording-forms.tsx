"use client";

import { useState } from "react";

import type { FormState } from "@/app/studio/actions";
import { attachRecordingAction, saveReliveAccessAction } from "@/app/studio/webinars/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import { RELIVE_ACCESS, widensAccess, type ReliveAccess } from "@/core/webinars/relive";

/** Picks a video of the library as the recording: ready ones, and ones still being prepared. */
export function AttachRecordingForm(props: {
  webinarId: string;
  videos: Array<{ id: string; title: string; processing: boolean }>;
}) {
  const t = useStudioText();
  const { state, pending, onSubmit } = useActionForm<FormState>(attachRecordingAction, {});
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="webinarId" value={props.webinarId} />
      <div className="field">
        <label htmlFor="recording-video" className="label">
          {t.t("webinars.recording.video")}
        </label>
        <select id="recording-video" name="assetId" className="select" required>
          {props.videos.map((video) => (
            <option key={video.id} value={video.id}>
              {video.processing
                ? t.t("webinars.recording.optionProcessing", { title: video.title })
                : video.title}
            </option>
          ))}
        </select>
      </div>
      <FormFeedback state={state} />
      <SubmitButton pending={pending} pendingLabel={t.t("common.saving")}>
        {t.t("webinars.recording.use")}
      </SubmitButton>
    </form>
  );
}

/**
 * Who may watch. The confirmation shows only when the choice shows the
 * recording to more people than now, and has to be ticked every time.
 */
export function ReliveAccessForm(props: { webinarId: string; current: ReliveAccess }) {
  const t = useStudioText();
  const [selected, setSelected] = useState<ReliveAccess>(props.current);
  const { state, pending, onSubmit } = useActionForm<FormState>(saveReliveAccessAction, {});
  const widening = widensAccess(props.current, selected);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="webinarId" value={props.webinarId} />
      <fieldset className="field">
        {/* The section's heading says it already. */}
        <legend className="sr-only">{t.t("webinars.recording.access")}</legend>
        <div className="grid gap-2">
          {RELIVE_ACCESS.map((access) => (
            <label key={access} className="flex gap-3 rounded-control border border-line p-3">
              <input
                type="radio"
                name="access"
                value={access}
                checked={selected === access}
                onChange={() => setSelected(access)}
                className="mt-1 size-4 shrink-0 accent-(--tenant-primary)"
              />
              <span>
                <span className="block text-sm font-semibold">
                  {t.t(`webinars.recording.access.${access}`)}
                </span>
                <span className="text-xs text-muted">
                  {t.t(`webinars.recording.access.${access}Hint`)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {widening && (
        <div className="space-y-1.5 rounded-control border border-line p-3">
          <label className="flex gap-3">
            <input
              type="checkbox"
              name="confirm"
              required
              className="mt-1 size-4 shrink-0 accent-(--tenant-primary)"
            />
            <span className="text-sm font-semibold">{t.t("webinars.recording.confirm")}</span>
          </label>
          <p className="hint pl-7">{t.t("webinars.recording.confirmHint")}</p>
        </div>
      )}
      <FormFeedback state={state} />
      <SubmitButton
        pending={pending}
        pendingLabel={t.t("common.saving")}
        disabled={selected === props.current}
      >
        {t.t("webinars.recording.save")}
      </SubmitButton>
    </form>
  );
}
