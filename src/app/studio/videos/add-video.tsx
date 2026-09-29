"use client";

import { Clapperboard, Link2, Upload } from "lucide-react";
import { useId, useRef, useState } from "react";

import type { FormState } from "@/app/studio/actions";
import { addVideoAction } from "@/app/studio/videos/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { uploadFile } from "@/components/ui/file-upload";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import type { Locale } from "@/core/i18n/locales";
import { languageName } from "@/core/i18n/studio/helpers";
import type { StudioKey } from "@/core/i18n/studio/index";

type Kind = "upload" | "recording" | "embed";

const KINDS: Array<{ kind: Kind; icon: typeof Upload; label: StudioKey; hint: StudioKey }> = [
  { kind: "upload", icon: Upload, label: "media.add.kind.upload", hint: "media.add.hint.upload" },
  {
    kind: "recording",
    icon: Clapperboard,
    label: "media.add.kind.recording",
    hint: "media.add.hint.recording",
  },
  { kind: "embed", icon: Link2, label: "media.add.kind.embed", hint: "media.add.hint.embed" },
];

const UPLOAD_ERRORS: Record<string, StudioKey> = {
  storage_quota: "media.error.storageQuota",
  too_large: "media.error.tooLarge",
  type_not_allowed: "media.error.type",
  unknown_type: "media.error.type",
  invalid_content: "media.error.type",
  rate_limited: "media.error.rateLimited",
};

const MAX_BYTES = 4096 * 1024 * 1024;

export interface RecordingOption {
  id: string;
  title: string;
  course: string;
  /** Still being transcribed: it can become a video once that is done. */
  pending: boolean;
}

/** Upload, course recording or YouTube/Vimeo link: the three ways into the media library. */
export function AddVideo(props: { locales: Locale[]; recordings: RecordingOption[] }) {
  const t = useStudioText();
  const uid = useId();
  const [kind, setKind] = useState<Kind>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { state, pending, onSubmit, submit } = useActionForm<FormState>(
    async (previous, formData) => {
      const result = await addVideoAction(previous, formData);
      if (result.ok) {
        formRef.current?.reset();
        setFile(null);
      }
      return result;
    },
    {},
  );
  const current = KINDS.find((option) => option.kind === kind)!;
  const busy = pending || percent !== null;

  /** Uploads first (with progress), then hands the stored file to the action. */
  const uploadThenAdd = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUploadError(null);
    if (!file) {
      setUploadError(t.t("media.error.chooseFile"));
      return;
    }
    const data = new FormData(event.currentTarget);
    setPercent(0);
    const result = await uploadFile("/api/uploads?purpose=video", file, (fraction) =>
      setPercent(Math.round(fraction * 100)),
    );
    setPercent(null);
    if (!result.ok) {
      setUploadError(t.t(UPLOAD_ERRORS[result.error] ?? "media.error.failed", { name: file.name }));
      return;
    }
    data.set("fileId", result.file.id);
    submit(data);
  };

  return (
    <section aria-labelledby={`${uid}-heading`} className="card space-y-5 p-5 sm:p-6">
      <h2 id={`${uid}-heading`} className="text-lg font-semibold">
        {t.t("media.add.title")}
      </h2>
      <div role="tablist" aria-label={t.t("media.add.kind")} className="flex flex-wrap gap-2">
        {KINDS.map((option) => (
          <button
            key={option.kind}
            type="button"
            role="tab"
            aria-selected={kind === option.kind}
            onClick={() => {
              setKind(option.kind);
              setUploadError(null);
            }}
            className={`btn btn-sm ${kind === option.kind ? "btn-primary" : "btn-secondary"}`}
          >
            <option.icon aria-hidden size={16} /> {t.t(option.label)}
          </button>
        ))}
      </div>
      <p className="max-w-3xl text-sm">{t.t(current.hint)}</p>

      <form
        ref={formRef}
        key={kind}
        onSubmit={kind === "upload" ? (event) => void uploadThenAdd(event) : onSubmit}
        className="grid gap-4 sm:grid-cols-2"
      >
        <input type="hidden" name="kind" value={kind} />

        {kind === "upload" && (
          <div className="field sm:col-span-2">
            <span className="label">{t.t("media.add.file")}</span>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
              >
                <Upload aria-hidden size={16} /> {t.t("media.add.choose")}
              </button>
              {file && (
                <span className="min-w-0 truncate text-sm">
                  {t.t("media.add.chosen", {
                    name: file.name,
                    size: `${t.number(Math.round(file.size / 1e5) / 10)} MB`,
                  })}
                </span>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm"
              className="sr-only"
              aria-label={t.t("media.add.file")}
              onChange={(event) => {
                const chosen = event.target.files?.[0] ?? null;
                setUploadError(
                  chosen && chosen.size > MAX_BYTES
                    ? t.t("media.error.tooLarge", { name: chosen.name })
                    : null,
                );
                setFile(chosen && chosen.size <= MAX_BYTES ? chosen : null);
              }}
            />
            {percent !== null && (
              <div className="space-y-1" role="status">
                <p className="text-sm">{t.t("media.add.uploading", { percent })}</p>
                <span className="progress block" aria-hidden>
                  <span style={{ width: `${percent}%` }} />
                </span>
              </div>
            )}
          </div>
        )}

        {kind === "recording" &&
          (props.recordings.length === 0 ? (
            <p className="text-sm text-muted sm:col-span-2">{t.t("media.add.noRecordings")}</p>
          ) : (
            <div className="field sm:col-span-2">
              <label htmlFor={`${uid}-recording`} className="label">
                {t.t("media.add.recording")}
              </label>
              <select id={`${uid}-recording`} name="sourceId" className="select" required>
                {props.recordings.map((recording) => (
                  <option key={recording.id} value={recording.id}>
                    {t.t(
                      recording.pending
                        ? "media.add.recordingPending"
                        : "media.add.recordingOption",
                      { title: recording.title, course: recording.course },
                    )}
                  </option>
                ))}
              </select>
            </div>
          ))}

        {kind === "embed" && (
          <div className="field sm:col-span-2">
            <label htmlFor={`${uid}-url`} className="label">
              {t.t("media.add.url")}
            </label>
            <input
              id={`${uid}-url`}
              name="url"
              type="url"
              inputMode="url"
              className="input"
              placeholder="https://www.youtube.com/watch?v=…"
              required
            />
          </div>
        )}

        {(kind !== "recording" || props.recordings.length > 0) && (
          <>
            <div className="field">
              <label htmlFor={`${uid}-title`} className="label">
                {t.t("media.add.titleLabel")}
              </label>
              <input
                id={`${uid}-title`}
                name="title"
                className="input"
                maxLength={200}
                placeholder={kind === "embed" ? undefined : t.t("media.add.titlePlaceholder")}
                required={kind === "embed"}
              />
            </div>
            {kind !== "recording" && props.locales.length > 1 && (
              <div className="field">
                <label htmlFor={`${uid}-locale`} className="label">
                  {t.t("media.add.language")}
                </label>
                <select id={`${uid}-locale`} name="locale" className="select">
                  {props.locales.map((locale) => (
                    <option key={locale} value={locale}>
                      {languageName(t, locale)}
                    </option>
                  ))}
                </select>
                <p className="hint">{t.t("media.add.languageHint")}</p>
              </div>
            )}
            {kind !== "recording" && props.locales.length === 1 && (
              <input type="hidden" name="locale" value={props.locales[0]} />
            )}
            <div className="space-y-3 sm:col-span-2">
              {uploadError && (
                <p
                  role="alert"
                  className="text-sm font-semibold"
                  style={{ color: "var(--status-critical)" }}
                >
                  {uploadError}
                </p>
              )}
              <FormFeedback state={state} />
              <SubmitButton pending={busy} pendingLabel={t.t("common.saving")}>
                {t.t(`media.add.submit.${kind}`)}
              </SubmitButton>
            </div>
          </>
        )}
      </form>
    </section>
  );
}
