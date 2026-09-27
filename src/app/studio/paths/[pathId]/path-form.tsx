"use client";

import { useState, useTransition } from "react";

import type { FormState } from "@/app/studio/actions";
import { savePathAction, setPathVisualAction } from "@/app/studio/paths/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { FileUpload } from "@/components/ui/file-upload";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import type { Locale, LocalizedText } from "@/core/i18n/locales";
import { languageName, studioUploadLabels } from "@/core/i18n/studio/helpers";

export function PathForm(props: {
  pathId: string;
  locales: Locale[];
  title: LocalizedText;
  promise: LocalizedText | null;
  color: string | null;
  fallbackColor: string;
  slug: string;
}) {
  const t = useStudioText();
  const { state, pending, onSubmit } = useActionForm<FormState>(savePathAction, {});
  const [color, setColor] = useState(props.color ?? "");

  return (
    <form onSubmit={onSubmit} className="card-flat space-y-5 p-5 sm:p-6">
      <input type="hidden" name="pathId" value={props.pathId} />
      <div className="grid gap-4 md:grid-cols-2">
        {props.locales.map((locale) => (
          <div key={locale} className="space-y-4">
            <div className="field">
              <label htmlFor={`title-${locale}`} className="label">
                {t.t("team.paths.nameIn", { language: languageName(t, locale) })}
              </label>
              <input
                id={`title-${locale}`}
                name={`title.${locale}`}
                className="input"
                maxLength={60}
                defaultValue={props.title[locale] ?? ""}
              />
            </div>
            <div className="field">
              <label htmlFor={`promise-${locale}`} className="label">
                {t.t("team.path.promiseIn", { language: languageName(t, locale) })}
              </label>
              <textarea
                id={`promise-${locale}`}
                name={`promise.${locale}`}
                className="textarea min-h-24"
                maxLength={300}
                defaultValue={props.promise?.[locale] ?? ""}
                placeholder={t.t("team.path.promisePlaceholder")}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="path-color" className="label">
            {t.t("team.path.color")}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={t.t("team.path.pickColor")}
              value={color || props.fallbackColor}
              onChange={(event) => setColor(event.target.value)}
              className="h-10 w-12 cursor-pointer rounded-control border border-line bg-card"
            />
            <input
              id="path-color"
              name="color"
              className="input font-mono"
              value={color}
              placeholder={t.t("team.path.colorFromBrand", { color: props.fallbackColor })}
              onChange={(event) => setColor(event.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="path-slug" className="label">
            {t.t("team.path.address")}
          </label>
          <input id="path-slug" name="slug" className="input font-mono" defaultValue={props.slug} />
          <p className="hint">{t.t("team.path.addressHint")}</p>
        </div>
      </div>
      <FormFeedback state={state} />
      <SubmitButton pending={pending} pendingLabel={t.t("common.saving")}>
        {t.t("team.path.save")}
      </SubmitButton>
    </form>
  );
}

/** Path picture: the upload is applied at once (SVGs are also rendered to PNG). */
export function PathVisualUpload(props: { pathId: string }) {
  const t = useStudioText();
  const [applying, startApplying] = useTransition();
  const [applied, setApplied] = useState<string | null>(null);
  const labels = studioUploadLabels(t);
  // What a path picture may be, where the generic labels would not say.
  const uploadLabels = {
    ...labels,
    choose: t.t("team.path.upload.choose"),
    errors: {
      ...labels.errors,
      too_large: t.t("team.path.upload.tooLarge"),
      type_not_allowed: t.t("team.path.upload.type"),
      invalid_content: t.t("team.path.upload.invalid"),
      too_many: t.t("team.path.upload.tooMany"),
    },
  };
  return (
    <div className="space-y-2">
      <FileUpload
        endpoint="/api/uploads?purpose=path_visual"
        name="uploaded"
        accept=".svg,.png,.webp,image/svg+xml,image/png,image/webp"
        maxFiles={1}
        maxBytes={1024 * 1024}
        labels={uploadLabels}
        onChange={(files) => {
          const id = files[0]?.id;
          if (!id || id === applied) return;
          setApplied(id);
          const data = new FormData();
          data.set("pathId", props.pathId);
          data.set("fileId", id);
          startApplying(() => setPathVisualAction(data));
        }}
      />
      {applying && <p className="hint">{t.t("team.path.applying")}</p>}
    </div>
  );
}
