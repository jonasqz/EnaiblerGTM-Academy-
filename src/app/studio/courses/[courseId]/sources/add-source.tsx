"use client";

import { FileText, Globe, MessageSquareQuote, Video } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRef, useState } from "react";

import type { FormState } from "@/app/studio/actions";
import { addSourceAction } from "@/app/studio/courses/[courseId]/sources/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { LANGUAGE_NAMES } from "@/components/studio/language-names";
import { ScreenRecorder } from "@/components/studio/screen-recorder";
import { FileUpload, type UploadedFile } from "@/components/ui/file-upload";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import type { Locale } from "@/core/i18n/locales";

type Kind = "recording" | "document" | "url";

const KINDS: Array<{ kind: Kind; label: string; icon: typeof Video; hint: string }> = [
  {
    kind: "recording",
    label: "Recording",
    icon: Video,
    hint: "A screen recording with narration (MP4, WebM, MOV or audio). We transcribe it, split it into steps and take a screenshot of each.",
  },
  {
    kind: "document",
    label: "Document",
    icon: FileText,
    hint: "A PDF, Markdown or text file: a whitepaper, a framework, your notes.",
  },
  {
    kind: "url",
    label: "Web page",
    icon: Globe,
    hint: "A blog post or article of yours. We read the page, not the whole site.",
  },
];

const UPLOAD_LABELS = {
  choose: "Choose a file",
  drop: "or drop it here",
  uploading: "Uploading… {percent} %",
  remove: "Remove",
  errors: {
    too_large: "{name} is too large (up to 2 GB).",
    type_not_allowed: "{name}: this type of file cannot be used here.",
    invalid_content: "{name} could not be read.",
    too_many: "One file at a time.",
    rate_limited: "Too many uploads this hour.",
    failed: "{name} could not be uploaded.",
  },
};

export function AddSource(props: { courseId: string; languages: Locale[] }) {
  const [kind, setKind] = useState<Kind>("recording");
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [uploadKey, setUploadKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit, submit } = useActionForm<FormState>(
    async (previous, formData) => {
      const result = await addSourceAction(previous, formData);
      if (result.ok) {
        setFile(null);
        setUploadKey((value) => value + 1);
        formRef.current?.reset();
      }
      return result;
    },
    {},
  );
  const endpoint = `/api/uploads?purpose=source&course=${props.courseId}`;
  const current = KINDS.find((option) => option.kind === kind)!;

  return (
    <section aria-labelledby="add-source-heading" className="card space-y-5 p-5 sm:p-6">
      <div>
        <h2 id="add-source-heading" className="text-lg font-semibold">
          Add a source
        </h2>
        <p className="text-sm text-muted">
          Everything stays on our servers in the EU: recordings are transcribed on our own speech
          recognition.
        </p>
      </div>
      <div role="tablist" aria-label="Kind of source" className="flex flex-wrap gap-2">
        {KINDS.map((option) => (
          <button
            key={option.kind}
            type="button"
            role="tab"
            aria-selected={kind === option.kind}
            onClick={() => {
              setKind(option.kind);
              setFile(null);
              setUploadKey((value) => value + 1);
            }}
            className={`btn btn-sm ${kind === option.kind ? "btn-primary" : "btn-secondary"}`}
          >
            <option.icon aria-hidden size={16} /> {option.label}
          </button>
        ))}
        <Link
          href={`/studio/courses/${props.courseId}/sources/interview` as Route}
          className="btn btn-secondary btn-sm"
        >
          <MessageSquareQuote aria-hidden size={16} /> Interview
        </Link>
      </div>
      <p className="text-sm">{current.hint}</p>

      <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
        <input type="hidden" name="courseId" value={props.courseId} />
        <input type="hidden" name="kind" value={kind} />
        {file && <input type="hidden" name="fileId" value={file.id} />}
        {kind === "url" ? (
          <div className="field">
            <label htmlFor="source-url" className="label">
              Address of the page
            </label>
            <input
              id="source-url"
              name="url"
              type="url"
              inputMode="url"
              className="input"
              placeholder="https://"
              required
            />
          </div>
        ) : (
          <div className="space-y-3">
            <FileUpload
              key={`${kind}-${uploadKey}`}
              endpoint={endpoint}
              name="uploaded"
              accept={
                kind === "recording"
                  ? "video/mp4,video/webm,video/quicktime,audio/*,.mp4,.webm,.mov,.m4a,.mp3,.wav"
                  : ".pdf,.md,.txt,application/pdf,text/markdown,text/plain"
              }
              maxFiles={1}
              maxBytes={2048 * 1024 * 1024}
              labels={UPLOAD_LABELS}
              onChange={(files) => setFile(files[0] ?? null)}
            />
            {kind === "recording" && !file && (
              <ScreenRecorder
                endpoint={endpoint}
                onUploaded={(uploaded) => {
                  setFile(uploaded);
                  // Straight in: the hidden fileId input is not rendered yet at this point.
                  const data = new FormData(formRef.current ?? undefined);
                  data.set("fileId", uploaded.id);
                  submit(data);
                }}
              />
            )}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="source-title" className="label">
              Title <span className="font-normal text-muted">(optional)</span>
            </label>
            <input id="source-title" name="title" className="input" maxLength={200} />
          </div>
          {props.languages.length > 1 && (
            <div className="field">
              <label htmlFor="source-locale" className="label">
                Spoken or written in
              </label>
              <select id="source-locale" name="locale" className="select">
                {props.languages.map((locale) => (
                  <option key={locale} value={locale}>
                    {LANGUAGE_NAMES[locale]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <FormFeedback state={state} />
        <SubmitButton pending={pending} disabled={kind !== "url" && !file} pendingLabel="Adding…">
          Add source
        </SubmitButton>
      </form>
    </section>
  );
}
