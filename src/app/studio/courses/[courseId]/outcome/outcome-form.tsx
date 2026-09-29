"use client";

import { Sparkles } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { saveOutcomeAction, type FormState } from "@/app/studio/actions";
import {
  draftAssignmentAction,
  draftRubricAction,
  type AssignmentDraftState,
} from "@/app/studio/courses/[courseId]/outcome/draft-actions";
import {
  draftFromRubric,
  RubricEditor,
  serializeRubric,
  withSavedIds,
  type RubricDraft,
} from "@/app/studio/courses/[courseId]/outcome/rubric-editor";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { FileUpload } from "@/components/ui/file-upload";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import { lintLocalizedWording } from "@/core/compliance/wording-lint";
import type { Locale, LocalizedText } from "@/core/i18n/locales";
import { languageName, studioUploadLabels, wordingText } from "@/core/i18n/studio/helpers";
import type { Rubric } from "@/core/review/rubric";

const FORM_EXAMPLE = `{
  "type": "object",
  "required": ["problem", "evidence"],
  "properties": {
    "problem": { "type": "string", "title": "Problem", "maxLength": 1000 },
    "evidence": { "type": "string", "title": "Evidence", "maxLength": 3000 }
  }
}`;

export interface OutcomeFormProps {
  courseId: string;
  languages: Locale[];
  artifactName: LocalizedText;
  prompt: LocalizedText;
  acceptText: boolean;
  acceptPdf: boolean;
  acceptImage: boolean;
  maxMb: number;
  acceptUrl: boolean;
  formSchema: string | null;
  rubric: Rubric;
  artifactTerm: string;
  /** Lessons point at criteria; replacing the rubric unlinks them. */
  lessonCount: number;
  aiAvailable: boolean;
  /** The homework deadline as the inputs take it, in the academy's zone ("" for none). */
  deadline: { date: string; time: string; zone: string; refusesLate: boolean };
}

/** "Draft with AI" (brief §7, step 1): a rubric from the outcome and one example of good work. */
function RubricDraftPanel(props: {
  courseId: string;
  form: React.RefObject<HTMLFormElement | null>;
  lessonCount: number;
  onDraft: (rubric: Rubric, example: string | null) => void;
}) {
  const t = useStudioText();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "good" | "error"; text: string } | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [example, setExample] = useState("");
  const [exampleFile, setExampleFile] = useState<string | null>(null);
  const [keep, setKeep] = useState(true);

  const run = () => {
    if (props.lessonCount > 0 && !window.confirm(t.t("authoring.draft.replaceConfirm"))) {
      return;
    }
    const data = new FormData(props.form.current ?? undefined);
    data.set("courseId", props.courseId);
    data.set("example", example);
    if (exampleFile) data.set("exampleFile", exampleFile);
    setMessage(null);
    startTransition(async () => {
      const result = await draftRubricAction(data);
      if (result.status === "error") {
        setMessage({ tone: "error", text: result.message });
        return;
      }
      props.onDraft(result.rubric, keep && result.example ? result.example : null);
      setNotes(result.notes);
      setMessage({ tone: "good", text: t.t("authoring.draft.ready") });
    });
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        <Sparkles aria-hidden size={16} /> {t.t("authoring.draft.title")}
      </button>
    );
  }
  return (
    <div className="space-y-4 rounded-card border border-line bg-subtle p-4">
      <div>
        <p className="font-semibold">{t.t("authoring.draft.title")}</p>
        <p className="text-sm text-muted">{t.t("authoring.draft.intro")}</p>
      </div>
      <div className="field">
        <label htmlFor="rubric-example" className="label">
          {t.t("authoring.draft.example")}
        </label>
        <textarea
          id="rubric-example"
          className="textarea min-h-32"
          value={example}
          onChange={(event) => setExample(event.target.value)}
          placeholder={t.t("authoring.draft.examplePlaceholder")}
          maxLength={40_000}
        />
      </div>
      <FileUpload
        endpoint={`/api/uploads?purpose=exemplar&course=${props.courseId}`}
        name="exampleFileId"
        accept=".pdf,.md,.txt,application/pdf,text/markdown,text/plain"
        maxFiles={1}
        maxBytes={20 * 1024 * 1024}
        labels={studioUploadLabels(t)}
        onChange={(files) => setExampleFile(files[0]?.id ?? null)}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={keep}
          onChange={(event) => setKeep(event.target.checked)}
          className="size-4 accent-(--tenant-primary)"
        />
        {t.t("authoring.draft.keepExample")}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary btn-sm" onClick={run} disabled={pending}>
          <Sparkles aria-hidden size={16} />{" "}
          {pending ? t.t("authoring.draft.drafting") : t.t("authoring.draft.run")}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          {t.t("authoring.draft.close")}
        </button>
      </div>
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className="text-sm font-semibold"
          style={message.tone === "error" ? { color: "var(--status-critical)" } : undefined}
        >
          {message.text}
        </p>
      )}
      {notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * "Suggest from your sources" (core/authoring/assignment-draft): name,
 * assignment and rubric from what the recordings and documents teach, put
 * into the form unsaved.
 */
function AssignmentDraftPanel(props: {
  courseId: string;
  form: React.RefObject<HTMLFormElement | null>;
  /** Whether replacing asks first: something typed, or lessons linked to criteria. */
  confirm: boolean;
  onDraft: (draft: Extract<AssignmentDraftState, { status: "done" }>) => void;
}) {
  const t = useStudioText();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "good" | "error"; text: string } | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  const run = () => {
    if (props.confirm && !window.confirm(t.t("drafts.assignment.replaceConfirm"))) return;
    const data = new FormData(props.form.current ?? undefined);
    data.set("courseId", props.courseId);
    setMessage(null);
    setNotes([]);
    startTransition(async () => {
      const result = await draftAssignmentAction(data);
      if (result.status === "error") {
        setMessage({ tone: "error", text: result.message });
        return;
      }
      props.onDraft(result);
      setNotes(result.notes);
      setMessage({ tone: "good", text: t.t("drafts.assignment.ready") });
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-secondary btn-sm" onClick={run} disabled={pending}>
          <Sparkles aria-hidden size={16} />{" "}
          {pending ? t.t("drafts.assignment.running") : t.t("drafts.assignment.run")}
        </button>
        <p className="text-sm text-muted">{t.t("drafts.assignment.intro")}</p>
      </div>
      <div aria-live="polite" className="space-y-1">
        {message && (
          <p
            role={message.tone === "error" ? "alert" : undefined}
            className="text-sm font-semibold"
            style={message.tone === "error" ? { color: "var(--status-critical)" } : undefined}
          >
            {message.text}
          </p>
        )}
        {notes.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function OutcomeForm(props: OutcomeFormProps) {
  const t = useStudioText();
  const primary = props.languages[0] ?? "en";
  const [draft, setDraft] = useState<RubricDraft>(() => draftFromRubric(props.rubric));
  const { state, pending, onSubmit } = useActionForm<FormState>(async (previous, formData) => {
    const result = await saveOutcomeAction(previous, formData);
    // New criteria keep the ids they were saved with, even if renamed later.
    if (result.ok) setDraft((current) => withSavedIds(current, primary));
    return result;
  }, {});
  const [artifactName, setArtifactName] = useState<LocalizedText>(props.artifactName);
  const [prompt, setPrompt] = useState<LocalizedText>(props.prompt);
  /** A drafted rubric in the editor: new criteria get their ids from the labels on save. */
  const takeRubric = (rubric: Rubric, exemplars: RubricDraft["exemplars"] | null) =>
    setDraft((current) => {
      const drafted = draftFromRubric(rubric);
      return {
        ...drafted,
        criteria: drafted.criteria.map((criterion, index) => ({
          ...criterion,
          key: `ai-${Date.now()}-${index}`,
          id: "",
        })),
        policy: current.policy,
        exemplars: exemplars ?? current.exemplars,
      };
    });
  const [useForm, setUseForm] = useState(props.formSchema !== null);
  const formRef = useRef<HTMLFormElement>(null);
  const twoColumns = props.languages.length > 1 ? "lg:grid-cols-2" : "";
  const nameFindings = lintLocalizedWording(artifactName, "artifact_name");

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-8">
      <input type="hidden" name="courseId" value={props.courseId} />
      <input type="hidden" name="rubric" value={JSON.stringify(serializeRubric(draft, primary))} />

      <section aria-labelledby="outcome-heading" className="card-flat space-y-5 p-5 sm:p-6">
        <div>
          <h2 id="outcome-heading" className="text-lg font-semibold">
            {t.t("authoring.outcome.build.title")}
          </h2>
          <p className="text-sm text-muted">
            {t.t("authoring.outcome.build.body", { artifact: props.artifactTerm })}
          </p>
        </div>
        {props.aiAvailable && (
          <AssignmentDraftPanel
            courseId={props.courseId}
            form={formRef}
            confirm={
              props.lessonCount > 0 ||
              Object.values(artifactName).some((value) => value?.trim()) ||
              Object.values(prompt).some((value) => value?.trim())
            }
            onDraft={(result) => {
              setArtifactName(result.artifactName);
              setPrompt(result.prompt);
              takeRubric(result.rubric, null);
            }}
          />
        )}
        <div className={`grid gap-5 ${twoColumns}`}>
          {props.languages.map((locale, index) => (
            <div key={locale} className="space-y-4">
              <p className="eyebrow">{languageName(t, locale)}</p>
              <div className="field">
                <label htmlFor={`artifactName.${locale}`} className="label">
                  {t.t("authoring.outcome.artifactName")}
                </label>
                <input
                  id={`artifactName.${locale}`}
                  name={`artifactName.${locale}`}
                  className="input"
                  maxLength={80}
                  required={index === 0}
                  value={artifactName[locale] ?? ""}
                  onChange={(event) =>
                    setArtifactName({ ...artifactName, [locale]: event.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor={`prompt.${locale}`} className="label">
                  {t.t("authoring.outcome.prompt")}
                </label>
                <textarea
                  id={`prompt.${locale}`}
                  name={`prompt.${locale}`}
                  className="textarea"
                  rows={7}
                  maxLength={4000}
                  required={index === 0}
                  value={prompt[locale] ?? ""}
                  onChange={(event) => setPrompt({ ...prompt, [locale]: event.target.value })}
                />
                <p className="hint">{t.t("authoring.outcome.promptHint")}</p>
              </div>
            </div>
          ))}
        </div>
        {nameFindings.length > 0 && (
          <p
            role="alert"
            className="text-sm font-semibold"
            style={{ color: "var(--status-critical)" }}
          >
            {wordingText(t, nameFindings[0]!)}
          </p>
        )}
      </section>

      <section aria-labelledby="handin-heading" className="card-flat space-y-4 p-5 sm:p-6">
        <div>
          <h2 id="handin-heading" className="text-lg font-semibold">
            {t.t("authoring.outcome.handIn.title")}
          </h2>
          <p className="text-sm text-muted">{t.t("authoring.outcome.handIn.body")}</p>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <label className="flex gap-3 rounded-control border border-line p-3">
            <input
              type="checkbox"
              name="acceptText"
              defaultChecked={props.acceptText}
              className="mt-1 size-4 shrink-0 accent-(--tenant-primary)"
            />
            <span>
              <span className="block text-sm font-semibold">
                {t.t("authoring.outcome.handIn.text")}
              </span>
              <span className="text-xs text-muted">{t.t("authoring.outcome.handIn.textBody")}</span>
            </span>
          </label>
          <label className="flex gap-3 rounded-control border border-line p-3">
            <input
              type="checkbox"
              name="acceptPdf"
              defaultChecked={props.acceptPdf}
              className="mt-1 size-4 shrink-0 accent-(--tenant-primary)"
            />
            <span>
              <span className="block text-sm font-semibold">
                {t.t("authoring.outcome.handIn.pdf")}
              </span>
              <span className="text-xs text-muted">{t.t("authoring.outcome.handIn.pdfBody")}</span>
            </span>
          </label>
          <label className="flex gap-3 rounded-control border border-line p-3">
            <input
              type="checkbox"
              name="acceptImage"
              defaultChecked={props.acceptImage}
              className="mt-1 size-4 shrink-0 accent-(--tenant-primary)"
            />
            <span>
              <span className="block text-sm font-semibold">
                {t.t("authoring.outcome.handIn.image")}
              </span>
              <span className="text-xs text-muted">
                {t.t("authoring.outcome.handIn.imageBody")}
              </span>
            </span>
          </label>
          <label className="flex gap-3 rounded-control border border-line p-3">
            <input
              type="checkbox"
              name="acceptUrl"
              defaultChecked={props.acceptUrl}
              className="mt-1 size-4 shrink-0 accent-(--tenant-primary)"
            />
            <span>
              <span className="block text-sm font-semibold">
                {t.t("authoring.outcome.handIn.url")}
              </span>
              <span className="text-xs text-muted">{t.t("authoring.outcome.handIn.urlBody")}</span>
            </span>
          </label>
          <label className="flex gap-3 rounded-control border border-line p-3">
            <input
              type="checkbox"
              name="acceptForm"
              checked={useForm}
              onChange={(event) => setUseForm(event.target.checked)}
              className="mt-1 size-4 shrink-0 accent-(--tenant-primary)"
            />
            <span>
              <span className="block text-sm font-semibold">
                {t.t("authoring.outcome.handIn.form")}
              </span>
              <span className="text-xs text-muted">{t.t("authoring.outcome.handIn.formBody")}</span>
            </span>
          </label>
        </div>
        {useForm && (
          <div className="field">
            <label htmlFor="formSchema" className="label">
              {t.t("authoring.outcome.formSchema")}
            </label>
            <textarea
              id="formSchema"
              name="formSchema"
              className="textarea textarea-code"
              rows={9}
              defaultValue={props.formSchema ?? FORM_EXAMPLE}
            />
            <p className="hint">{t.t("authoring.outcome.formSchemaHint")}</p>
          </div>
        )}
        <div className="field max-w-xs">
          <label htmlFor="maxMb" className="label">
            {t.t("authoring.outcome.maxMb")}
          </label>
          <select id="maxMb" name="maxMb" className="select" defaultValue={String(props.maxMb)}>
            {[5, 10, 15, 25, 50].map((mb) => (
              <option key={mb} value={mb}>
                {mb} MB
              </option>
            ))}
          </select>
          <p className="hint">{t.t("authoring.outcome.maxMbHint")}</p>
        </div>
        <fieldset className="field border-t border-line pt-4">
          <legend className="label mb-1.5">{t.t("series.deadline.title")}</legend>
          <div className="flex flex-wrap items-end gap-3">
            <div className="field">
              <label htmlFor="dueDate" className="label text-sm font-normal">
                {t.t("series.deadline.date")}
              </label>
              <input
                id="dueDate"
                name="dueDate"
                type="date"
                className="input w-auto"
                defaultValue={props.deadline.date}
                aria-describedby="due-hint"
              />
            </div>
            <div className="field">
              <label htmlFor="dueTime" className="label text-sm font-normal">
                {t.t("series.deadline.time")}
              </label>
              <input
                id="dueTime"
                name="dueTime"
                type="time"
                className="input w-auto"
                defaultValue={props.deadline.time}
                aria-describedby="due-hint"
              />
            </div>
          </div>
          <p id="due-hint" className="hint">
            {t.t("series.deadline.hint", { zone: props.deadline.zone })}{" "}
            {t.t(
              props.deadline.refusesLate ? "series.deadline.refused" : "series.deadline.accepted",
            )}{" "}
            <a href="/studio/settings#homework-heading" className="underline">
              {t.t("series.deadline.settings")}
            </a>
          </p>
        </fieldset>
      </section>

      <section
        id="rubric"
        aria-labelledby="rubric-heading"
        className="card-flat space-y-5 scroll-mt-6 p-5 sm:p-6"
      >
        <div>
          <h2 id="rubric-heading" className="text-lg font-semibold">
            {t.t("authoring.outcome.rubric.title")}
          </h2>
          <p className="text-sm text-muted">{t.t("authoring.outcome.rubric.body")}</p>
        </div>
        {props.aiAvailable && (
          <RubricDraftPanel
            courseId={props.courseId}
            form={formRef}
            lessonCount={props.lessonCount}
            onDraft={(rubric, example) =>
              takeRubric(
                rubric,
                example
                  ? [
                      ...draft.exemplars.filter((exemplar) => exemplar.id !== "ai-example"),
                      { id: "ai-example", expected_pass: true, content: example },
                    ].slice(-10)
                  : null,
              )
            }
          />
        )}
        <RubricEditor draft={draft} onChange={setDraft} languages={props.languages} />
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 space-y-3 border-t border-line bg-surface/95 px-4 py-4 backdrop-blur-sm sm:mx-0 sm:rounded-card sm:border">
        <FormFeedback state={state} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">{t.t("authoring.outcome.appliesToNew")}</p>
          <SubmitButton pending={pending} pendingLabel={t.t("common.saving")}>
            {t.t("authoring.outcome.save")}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
