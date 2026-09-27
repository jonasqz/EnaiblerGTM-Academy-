"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { saveShowcaseAction, type ShowcaseState } from "@/app/(academy)/verify/[publicId]/actions";
import { FileUpload, type FileUploadLabels } from "@/components/ui/file-upload";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";

export interface ShowcaseEditorLabels {
  title: string;
  hint: string;
  text: string;
  pictures: string;
  save: string;
  saving: string;
  remove: string;
  saved: string;
  upload: FileUploadLabels;
}

/** The owner's editor for the excerpt shown on their public credential page. */
export function ShowcaseEditor(props: {
  publicId: string;
  text: string;
  pictures: string[];
  maxText: number;
  maxPictures: number;
  hasShowcase: boolean;
  labels: ShowcaseEditorLabels;
}) {
  const [kept, setKept] = useState(props.pictures);
  const [uploaderKey, setUploaderKey] = useState(0);
  const { state, pending, onSubmit } = useActionForm<ShowcaseState>(
    async (previous, formData) => {
      const result = await saveShowcaseAction(previous, formData);
      // Saved: what was sent is what the page shows now; the uploader starts empty again.
      if (result.status === "saved") {
        setKept(formData.get("remove") === "1" ? [] : formData.getAll("pictures").map(String));
        setUploaderKey((key) => key + 1);
      }
      return result;
    },
    { status: "idle" },
  );
  const room = props.maxPictures - kept.length;
  return (
    <section className="card-flat space-y-4 p-5" aria-labelledby="showcase-editor-heading">
      <h2 id="showcase-editor-heading" className="font-semibold">
        {props.labels.title}
      </h2>
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="hint">{props.labels.hint}</p>
        <input type="hidden" name="publicId" value={props.publicId} />
        <div className="field">
          <label htmlFor="showcase-text" className="label">
            {props.labels.text}
          </label>
          <textarea
            id="showcase-text"
            name="text"
            className="textarea min-h-40 font-mono text-sm"
            defaultValue={props.text}
            maxLength={props.maxText}
          />
        </div>
        <div className="space-y-2">
          <p className="label">{props.labels.pictures}</p>
          {kept.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {kept.map((id) => (
                <li key={id} className="relative">
                  <input type="hidden" name="pictures" value={id} />
                  {/* eslint-disable-next-line @next/next/no-img-element -- the learner's own upload */}
                  <img
                    src={`/files/${id}`}
                    alt=""
                    className="size-24 rounded-control border border-line object-cover"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm absolute -top-2 -right-2 px-1.5"
                    aria-label={props.labels.upload.remove}
                    onClick={() => setKept((current) => current.filter((other) => other !== id))}
                  >
                    <X aria-hidden size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {room > 0 && (
            <FileUpload
              key={uploaderKey}
              endpoint={`/api/uploads?purpose=showcase&credential=${props.publicId}`}
              name="pictures"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              maxFiles={room}
              maxBytes={5 * 1024 * 1024}
              labels={props.labels.upload}
            />
          )}
        </div>
        {state.status === "error" && <Notice tone="critical" title={state.message} />}
        {state.status === "saved" && <Notice tone="good" title={props.labels.saved} />}
        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={pending} pendingLabel={props.labels.saving}>
            {props.labels.save}
          </SubmitButton>
          {props.hasShowcase && (
            <button type="submit" name="remove" value="1" className="btn btn-ghost">
              {props.labels.remove}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
