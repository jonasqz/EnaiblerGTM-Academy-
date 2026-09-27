"use client";

import { Circle, CircleCheck, Columns2, Eye, ImagePlus, PencilLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { saveLessonAction, type FormState } from "@/app/studio/actions";
import { CheckEditor } from "@/app/studio/courses/[courseId]/lessons/[lessonId]/check-editor";
import { KnowledgeCheck, type KnowledgeCheckLabels } from "@/components/knowledge-check";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { Badge } from "@/components/ui/badge";
import { uploadFile } from "@/components/ui/file-upload";
import { Markdown } from "@/components/ui/markdown";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import { lintWording } from "@/core/compliance/wording-lint";
import type { Locale } from "@/core/i18n/locales";
import { languageName, wordingText } from "@/core/i18n/studio/helpers";
import type { StudioKey } from "@/core/i18n/studio/index";
import { cleanCheckQuestions, previewCheckQuestions } from "@/core/questions/knowledge-check";
import type { CheckQuestion } from "@/core/questions/questions";
import { canonicalJson, sameJson } from "@/core/shared/json";

type Mode = "write" | "split" | "preview";

const MODES: Array<{ mode: Mode; icon: typeof PencilLine }> = [
  { mode: "write", icon: PencilLine },
  { mode: "split", icon: Columns2 },
  { mode: "preview", icon: Eye },
];

const UPLOAD_ERRORS: Record<string, StudioKey> = {
  too_large: "lessons.editor.upload.tooLarge",
  type_not_allowed: "lessons.editor.upload.type",
  unknown_type: "lessons.editor.upload.type",
  invalid_content: "lessons.editor.upload.invalid",
  rate_limited: "lessons.editor.upload.rateLimited",
};

export interface LessonEditorProps {
  courseId: string;
  lessonId: string;
  locale: Locale;
  title: string;
  markdown: string;
  criteria: Array<{ id: string; label: string; description: string }>;
  selected: string[];
  questions: CheckQuestion[];
  reference: {
    locale: Locale;
    title: string;
    markdown: string;
    questions: CheckQuestion[];
  } | null;
  /** The academy's theme variables: the preview shows the lesson as learners see it. */
  academyTheme: Record<string, string>;
  /** The knowledge check's words in the preview, in a language the academy offers. */
  checkLabels: KnowledgeCheckLabels;
}

export function LessonEditor(props: LessonEditorProps) {
  const t = useStudioText();
  const [title, setTitle] = useState(props.title);
  const [markdown, setMarkdown] = useState(props.markdown);
  const [selected, setSelected] = useState<string[]>(props.selected);
  const [questions, setQuestions] = useState<CheckQuestion[]>(props.questions);
  const [saved, setSaved] = useState({
    title: props.title,
    markdown: props.markdown,
    selected: props.selected,
    questions: cleanCheckQuestions(props.questions),
  });
  const [mode, setMode] = useState<Mode>("write");
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<{ name: string; percent: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  /** Uploads an image or video and inserts it where the cursor is. */
  const insertMedia = async (file: File) => {
    setUploadError(null);
    setUpload({ name: file.name, percent: 0 });
    const result = await uploadFile(
      `/api/uploads?purpose=lesson_media&course=${props.courseId}`,
      file,
      (fraction) => setUpload({ name: file.name, percent: Math.round(fraction * 100) }),
    );
    setUpload(null);
    if (!result.ok) {
      setUploadError(
        t.t(UPLOAD_ERRORS[result.error] ?? "lessons.editor.upload.failed", { name: file.name }),
      );
      return;
    }
    const extension = result.file.contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";
    const label = file.name.replace(/\.[^.]+$/, "").replace(/[[\]]/g, "");
    const snippet = `\n\n![${label}](/files/${result.file.id}.${extension})\n\n`;
    const area = textareaRef.current;
    const at = area ? area.selectionStart : markdown.length;
    setMarkdown((current) =>
      `${current.slice(0, at)}${snippet}${current.slice(at)}`.replace(/^\n+/, ""),
    );
  };
  const { state, pending, onSubmit } = useActionForm<FormState>(async (previous, formData) => {
    const result = await saveLessonAction(previous, formData);
    if (result.ok) {
      setSaved({
        title: String(formData.get("title") ?? "").trim(),
        markdown: String(formData.get("markdown") ?? ""),
        selected: formData.getAll("criteria").map(String),
        questions: JSON.parse(String(formData.get("questions") ?? "[]")) as CheckQuestion[],
      });
    }
    return result;
  }, {});

  // Sent and compared the way the server stores them, so stray spaces are no change.
  const cleanQuestions = cleanCheckQuestions(questions);
  const preview = previewCheckQuestions(questions);
  const dirty =
    title.trim() !== saved.title ||
    markdown !== saved.markdown ||
    [...selected].sort().join() !== [...saved.selected].sort().join() ||
    !sameJson(cleanQuestions, saved.questions);
  const words = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
  const findings = lintWording(`${title}\n${markdown}`, "lesson_text");

  // Cmd/Ctrl+S saves; leaving with unsaved changes asks first.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    const onLeave = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [dirty]);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
      <input type="hidden" name="lessonId" value={props.lessonId} />
      <input type="hidden" name="questions" value={JSON.stringify(cleanQuestions)} />

      <div className="field">
        <label htmlFor="lesson-title" className="label">
          {t.t("lessons.field.title")}{" "}
          <span className="font-normal text-muted">({languageName(t, props.locale)})</span>
        </label>
        <input
          id="lesson-title"
          name="title"
          className="input text-lg font-semibold"
          required
          maxLength={160}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="group"
            aria-label={t.t("lessons.editor.view")}
            className="inline-flex rounded-control border border-line bg-card p-0.5"
          >
            {MODES.map((option) => (
              <button
                key={option.mode}
                type="button"
                aria-pressed={mode === option.mode}
                onClick={() => setMode(option.mode)}
                className={`inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-semibold ${
                  mode === option.mode ? "bg-primary-soft" : "text-muted hover:text-ink"
                } ${option.mode === "split" ? "max-lg:hidden" : ""}`}
              >
                <option.icon aria-hidden size={16} /> {t.t(`lessons.editor.mode.${option.mode}`)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => mediaInput.current?.click()}
              disabled={upload !== null}
            >
              <ImagePlus aria-hidden size={16} />
              {upload
                ? t.t("lessons.editor.uploading", { percent: upload.percent })
                : t.t("lessons.editor.media")}
            </button>
            <input
              ref={mediaInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
              className="sr-only"
              aria-label={t.t("lessons.editor.mediaUpload")}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void insertMedia(file);
              }}
            />
            <p className="text-sm text-muted tabular-nums">
              {t.n("lessons.editor.stats", words, {
                minutes: Math.max(1, Math.round(words / 200)),
              })}
            </p>
          </div>
        </div>

        <div className={`grid gap-4 ${mode === "split" ? "lg:grid-cols-2" : ""}`}>
          <div className={mode === "preview" ? "hidden" : ""}>
            <label htmlFor="lesson-markdown" className="sr-only">
              {t.t("lessons.editor.textLabel")}
            </label>
            <textarea
              ref={textareaRef}
              id="lesson-markdown"
              name="markdown"
              className="textarea textarea-code min-h-[28rem]"
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
              placeholder={t.t("lessons.editor.placeholder")}
            />
            <p className="hint mt-1">
              Markdown: <code>## Heading</code>, <code>**bold**</code>, <code>- list</code>,{" "}
              <code>[link](https://…)</code>. {t.t("lessons.editor.mediaHint")}
            </p>
            {uploadError && (
              <p
                role="alert"
                className="hint font-semibold"
                style={{ color: "var(--status-critical)" }}
              >
                {uploadError}
              </p>
            )}
          </div>
          {mode !== "write" && (
            <div
              data-theme-scope
              style={props.academyTheme}
              className="min-h-[28rem] min-w-0 rounded-card bg-surface p-3 font-body text-ink"
              aria-label={t.t("lessons.editor.mode.preview")}
            >
              <div className="card h-full p-6">
                <h2 className="mb-4 font-display text-2xl leading-tight">
                  {title || t.t("common.actions.untitledLesson")}
                </h2>
                {markdown.trim() ? (
                  <Markdown source={markdown} />
                ) : (
                  <p className="text-muted">{t.t("lessons.editor.previewEmpty")}</p>
                )}
                {preview.length > 0 && (
                  <KnowledgeCheck
                    // Starts over when the questions change, so no answer outlives its question.
                    key={canonicalJson(preview)}
                    questions={preview}
                    labels={props.checkLabels}
                    headingLevel={3}
                    className="mt-8 border-t border-line pt-6"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {findings.length > 0 && (
        <FormFeedback
          state={{ warnings: [...new Set(findings.map((finding) => wordingText(t, finding)))] }}
        />
      )}

      <CheckEditor questions={questions} onChange={setQuestions} />

      <fieldset className="card-flat space-y-3 p-4">
        <legend className="px-1 font-semibold">{t.t("lessons.editor.teaches")}</legend>
        {props.criteria.length === 0 ? (
          <p className="text-sm text-muted">{t.t("lessons.editor.noCriteria")}</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {props.criteria.map((criterion) => (
              <label
                key={criterion.id}
                className="flex gap-3 rounded-control border border-line p-3"
              >
                <input
                  type="checkbox"
                  name="criteria"
                  value={criterion.id}
                  checked={selected.includes(criterion.id)}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...selected, criterion.id]
                        : selected.filter((id) => id !== criterion.id),
                    )
                  }
                  className="mt-1 size-4 shrink-0 accent-(--tenant-primary)"
                />
                <span>
                  <span className="block text-sm font-semibold">{criterion.label}</span>
                  <span className="text-xs text-muted">{criterion.description}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {props.reference && (
        <details className="card-flat p-4">
          <summary className="cursor-pointer font-semibold">
            {t.t("lessons.editor.reference", {
              language: languageName(t, props.reference.locale),
            })}
          </summary>
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-3 font-semibold">{props.reference.title}</p>
            {props.reference.markdown.trim() ? (
              <Markdown source={props.reference.markdown} />
            ) : (
              <p className="text-sm text-muted">{t.t("lessons.editor.noContent")}</p>
            )}
            {props.reference.questions.length > 0 && (
              <div className="mt-6 space-y-3 border-t border-line pt-4">
                <p className="font-semibold">{t.t("lessons.check.title")}</p>
                <ol className="space-y-4 text-sm">
                  {props.reference.questions.map((question, index) => (
                    <li key={question.id} className="space-y-1.5">
                      <p className="font-semibold">
                        {index + 1}. {question.prompt}
                      </p>
                      <ul className="space-y-1">
                        {question.options.map((option) => {
                          const right = question.correct.includes(option.id);
                          const Icon = right ? CircleCheck : Circle;
                          return (
                            <li key={option.id} className="flex flex-wrap items-center gap-2">
                              <Icon
                                aria-hidden
                                size={14}
                                className="shrink-0 text-muted"
                                style={right ? { color: "var(--status-good)" } : undefined}
                              />
                              <span className="min-w-0 break-words">{option.text}</span>
                              {right && <Badge tone="good">{t.t("lessons.check.right")}</Badge>}
                            </li>
                          );
                        })}
                      </ul>
                      {question.explanation && <p className="text-muted">{question.explanation}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </details>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 space-y-3 border-t border-line bg-surface/95 px-4 py-4 backdrop-blur-sm sm:mx-0 sm:rounded-card sm:border">
        <FormFeedback state={{ ...state, warnings: undefined }} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted" aria-live="polite">
            {dirty ? t.t("lessons.editor.unsaved") : t.t("lessons.editor.saved")} ·{" "}
            {t.t("lessons.editor.everySave")}
          </p>
          <SubmitButton pending={pending} pendingLabel={t.t("common.saving")} disabled={!dirty}>
            {t.t("common.save")}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
