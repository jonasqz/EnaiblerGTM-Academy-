"use client";

import type { FormState } from "@/app/studio/actions";
import { saveVideoAction } from "@/app/studio/videos/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import type { MediaAccess } from "@/core/media/access";
import { clockTime } from "@/core/media/captions";
import type { Chapter } from "@/core/media/chapters";

const ACCESS: MediaAccess[] = ["learners", "public"];

/** Title, who can watch, and the chapters' names (they start where the topics change). */
export function VideoForm(props: {
  assetId: string;
  title: string;
  access: MediaAccess;
  chapters: Chapter[];
}) {
  const t = useStudioText();
  const { state, pending, onSubmit } = useActionForm<FormState>(saveVideoAction, {});
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <input type="hidden" name="assetId" value={props.assetId} />
      <div className="field">
        <label htmlFor="video-title" className="label">
          {t.t("media.field.title")}
        </label>
        <input
          id="video-title"
          name="title"
          className="input"
          required
          maxLength={200}
          defaultValue={props.title}
        />
      </div>

      <fieldset className="field">
        <legend className="label mb-1.5">{t.t("media.field.access")}</legend>
        <div className="grid gap-2">
          {ACCESS.map((access) => (
            <label key={access} className="flex gap-3 rounded-control border border-line p-3">
              <input
                type="radio"
                name="access"
                value={access}
                defaultChecked={props.access === access}
                className="mt-1 size-4 shrink-0 accent-(--tenant-primary)"
              />
              <span>
                <span className="block text-sm font-semibold">
                  {t.t(`media.field.access.${access}`)}
                </span>
                <span className="text-xs text-muted">
                  {t.t(`media.field.access.${access}Hint`)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {props.chapters.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="label">{t.t("media.field.chapters")}</legend>
          <p className="hint">{t.t("media.field.chaptersHint")}</p>
          <ol className="space-y-2">
            {props.chapters.map((chapter, index) => (
              <li key={chapter.startSec} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-sm text-muted tabular-nums">
                  {clockTime(chapter.startSec)}
                </span>
                <label htmlFor={`chapter-${index}`} className="sr-only">
                  {t.t("media.field.chapter", {
                    n: index + 1,
                    time: clockTime(chapter.startSec),
                  })}
                </label>
                <input
                  id={`chapter-${index}`}
                  name="chapter"
                  className="input"
                  maxLength={120}
                  defaultValue={chapter.title}
                  placeholder={t.t("media.field.chapterPlaceholder", { n: index + 1 })}
                />
              </li>
            ))}
          </ol>
        </fieldset>
      )}

      <FormFeedback state={state} />
      <SubmitButton pending={pending} pendingLabel={t.t("common.saving")}>
        {t.t("media.save")}
      </SubmitButton>
    </form>
  );
}
