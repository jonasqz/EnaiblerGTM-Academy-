"use client";

import { FileText, Globe, MessageSquareQuote, MessagesSquare, Upload, Video } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useId, useRef, useState } from "react";

import type { FormState } from "@/app/studio/actions";
import { addSourceAction } from "@/app/studio/courses/[courseId]/sources/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { ScreenRecorder } from "@/components/studio/screen-recorder";
import { useStudioText } from "@/components/studio/studio-text";
import { FileUpload, type UploadedFile } from "@/components/ui/file-upload";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import type { Locale } from "@/core/i18n/locales";
import { languageName, studioUploadLabels } from "@/core/i18n/studio/helpers";
import type { StudioKey } from "@/core/i18n/studio/index";

type Kind = "recording" | "document" | "url" | "qa";

/** A Q&A export is read in the browser: only the parsed questions and answers reach the server. */
const QA_MAX_BYTES = 1024 * 1024;

const KINDS: Array<{ kind: Kind; label: StudioKey; icon: typeof Video; hint: StudioKey }> = [
  {
    kind: "recording",
    label: "lessons.sources.kind.recording",
    icon: Video,
    hint: "lessons.addSource.hint.recording",
  },
  {
    kind: "document",
    label: "lessons.sources.kind.document",
    icon: FileText,
    hint: "lessons.addSource.hint.document",
  },
  {
    kind: "url",
    label: "lessons.sources.kind.url",
    icon: Globe,
    hint: "lessons.addSource.hint.url",
  },
  {
    kind: "qa",
    label: "lessons.sources.kind.qa",
    icon: MessagesSquare,
    hint: "drafts.qa.hint",
  },
];

export function AddSource(props: { courseId: string; languages: Locale[] }) {
  const t = useStudioText();
  const uid = useId();
  const [kind, setKind] = useState<Kind>("recording");
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [uploadKey, setUploadKey] = useState(0);
  const [qa, setQa] = useState("");
  const [qaError, setQaError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit, submit } = useActionForm<FormState>(
    async (previous, formData) => {
      const result = await addSourceAction(previous, formData);
      if (result.ok) {
        setFile(null);
        setQa("");
        setUploadKey((value) => value + 1);
        formRef.current?.reset();
      }
      return result;
    },
    {},
  );
  const loadExport = async (chosen: File | undefined) => {
    setQaError(null);
    if (!chosen) return;
    if (chosen.size > QA_MAX_BYTES) {
      setQaError(t.t("drafts.qa.tooLarge"));
      return;
    }
    setQa(await chosen.text());
  };
  const endpoint = `/api/uploads?purpose=source&course=${props.courseId}`;
  const current = KINDS.find((option) => option.kind === kind)!;
  // The Studio's upload labels, keeping this upload's progress and its 2 GB limit in words.
  const uploadLabels = studioUploadLabels(t);

  return (
    <section aria-labelledby="add-source-heading" className="card space-y-5 p-5 sm:p-6">
      <div>
        <h2 id="add-source-heading" className="text-lg font-semibold">
          {t.t("lessons.addSource.title")}
        </h2>
        <p className="text-sm text-muted">{t.t("lessons.addSource.privacy")}</p>
      </div>
      <div
        role="tablist"
        aria-label={t.t("lessons.addSource.kind")}
        className="flex flex-wrap gap-2"
      >
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
            <option.icon aria-hidden size={16} /> {t.t(option.label)}
          </button>
        ))}
        <Link
          href={`/studio/courses/${props.courseId}/sources/interview` as Route}
          className="btn btn-secondary btn-sm"
        >
          <MessageSquareQuote aria-hidden size={16} /> {t.t("lessons.sources.kind.interview")}
        </Link>
      </div>
      <p className="text-sm">{t.t(current.hint)}</p>

      <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
        <input type="hidden" name="courseId" value={props.courseId} />
        <input type="hidden" name="kind" value={kind} />
        {file && <input type="hidden" name="fileId" value={file.id} />}
        {kind === "url" ? (
          <div className="field">
            <label htmlFor="source-url" className="label">
              {t.t("lessons.addSource.url")}
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
        ) : kind === "qa" ? (
          <div className="space-y-3">
            <div className="field">
              <label htmlFor={`${uid}-qa`} className="label">
                {t.t("drafts.qa.text")}
              </label>
              <textarea
                id={`${uid}-qa`}
                name="qa"
                className="textarea min-h-48"
                value={qa}
                onChange={(event) => setQa(event.target.value)}
                placeholder={t.t("drafts.qa.placeholder")}
                aria-describedby={`${uid}-qa-privacy`}
                required
              />
              <p id={`${uid}-qa-privacy`} className="hint">
                {t.t("drafts.qa.privacy")}
              </p>
            </div>
            <label className="btn btn-secondary btn-sm cursor-pointer focus-within:outline-2 focus-within:outline-offset-2">
              <Upload aria-hidden size={16} /> {t.t("drafts.qa.load")}
              <input
                type="file"
                accept=".csv,.txt,.tsv,text/csv,text/plain,text/tab-separated-values"
                className="sr-only"
                onChange={(event) => void loadExport(event.target.files?.[0])}
              />
            </label>
            {qaError && (
              <p
                role="alert"
                className="text-sm font-semibold"
                style={{ color: "var(--status-critical)" }}
              >
                {qaError}
              </p>
            )}
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
              labels={{
                ...uploadLabels,
                uploading: t.t("lessons.addSource.uploading"),
                errors: { ...uploadLabels.errors, too_large: t.t("lessons.addSource.tooLarge") },
              }}
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
              {t.t("lessons.field.title")}{" "}
              <span className="font-normal text-muted">({t.t("common.optional")})</span>
            </label>
            <input id="source-title" name="title" className="input" maxLength={200} />
          </div>
          {props.languages.length > 1 && (
            <div className="field">
              <label htmlFor="source-locale" className="label">
                {t.t("lessons.addSource.locale")}
              </label>
              <select id="source-locale" name="locale" className="select">
                {props.languages.map((locale) => (
                  <option key={locale} value={locale}>
                    {languageName(t, locale)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <FormFeedback state={state} />
        <SubmitButton
          pending={pending}
          disabled={kind === "qa" ? !qa.trim() : kind !== "url" && !file}
          pendingLabel={t.t("common.adding")}
        >
          {t.t("lessons.addSource.submit")}
        </SubmitButton>
      </form>
    </section>
  );
}
