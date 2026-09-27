"use client";

import { useState, useTransition } from "react";

import type { FormState } from "@/app/studio/actions";
import { savePathAction, setPathVisualAction } from "@/app/studio/paths/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { LANGUAGE_NAMES } from "@/components/studio/language-names";
import { FileUpload } from "@/components/ui/file-upload";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import type { Locale, LocalizedText } from "@/core/i18n/locales";

export function PathForm(props: {
  pathId: string;
  locales: Locale[];
  title: LocalizedText;
  promise: LocalizedText | null;
  color: string | null;
  fallbackColor: string;
  slug: string;
}) {
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
                Name ({LANGUAGE_NAMES[locale]})
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
                Promise ({LANGUAGE_NAMES[locale]})
              </label>
              <textarea
                id={`promise-${locale}`}
                name={`promise.${locale}`}
                className="textarea min-h-24"
                maxLength={300}
                defaultValue={props.promise?.[locale] ?? ""}
                placeholder="What learners on this path become able to do."
              />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="path-color" className="label">
            Colour
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Pick the colour"
              value={color || props.fallbackColor}
              onChange={(event) => setColor(event.target.value)}
              className="h-10 w-12 cursor-pointer rounded-control border border-line bg-card"
            />
            <input
              id="path-color"
              name="color"
              className="input font-mono"
              value={color}
              placeholder={`${props.fallbackColor} (from the brand)`}
              onChange={(event) => setColor(event.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="path-slug" className="label">
            Address
          </label>
          <input id="path-slug" name="slug" className="input font-mono" defaultValue={props.slug} />
          <p className="hint">
            Used in /paths/… and entry links (?path=…). Changing it breaks old links.
          </p>
        </div>
      </div>
      <FormFeedback state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save path
      </SubmitButton>
    </form>
  );
}

const UPLOAD_LABELS = {
  choose: "Upload SVG or PNG",
  drop: "or drop it here",
  uploading: "Uploading… {percent} %",
  remove: "Remove",
  errors: {
    too_large: "{name} is too large (up to 1 MB).",
    type_not_allowed: "{name}: use SVG, PNG or WebP.",
    invalid_content:
      "{name} could not be used: SVGs must not contain scripts or links to other files.",
    too_many: "One picture per path.",
    rate_limited: "Too many uploads this hour.",
    failed: "{name} could not be uploaded.",
  },
};

/** Path picture: the upload is applied at once (SVGs are also rendered to PNG). */
export function PathVisualUpload(props: { pathId: string }) {
  const [applying, startApplying] = useTransition();
  const [applied, setApplied] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <FileUpload
        endpoint="/api/uploads?purpose=path_visual"
        name="uploaded"
        accept=".svg,.png,.webp,image/svg+xml,image/png,image/webp"
        maxFiles={1}
        maxBytes={1024 * 1024}
        labels={UPLOAD_LABELS}
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
      {applying && <p className="hint">Applying the picture…</p>}
    </div>
  );
}
