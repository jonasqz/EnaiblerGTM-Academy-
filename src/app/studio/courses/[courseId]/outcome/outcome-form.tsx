"use client";

import { Sparkles } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { saveOutcomeAction, type FormState } from "@/app/studio/actions";
import { draftRubricAction } from "@/app/studio/courses/[courseId]/outcome/draft-actions";
import {
  draftFromRubric,
  RubricEditor,
  serializeRubric,
  withSavedIds,
  type RubricDraft,
} from "@/app/studio/courses/[courseId]/outcome/rubric-editor";
import { FormFeedback } from "@/components/studio/form-feedback";
import { FileUpload } from "@/components/ui/file-upload";
import { LANGUAGE_NAMES } from "@/components/studio/language-names";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import { lintLocalizedWording, describeFinding } from "@/core/compliance/wording-lint";
import type { Locale, LocalizedText } from "@/core/i18n/locales";
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
}

const EXAMPLE_UPLOAD_LABELS = {
  choose: "Upload a PDF or .md",
  drop: "or paste the text above",
  uploading: "Uploading… {percent} %",
  remove: "Remove",
  errors: {
    too_large: "{name} is too large (up to 20 MB).",
    type_not_allowed: "{name}: use a PDF, Markdown or text file.",
    invalid_content: "{name} could not be read.",
    too_many: "One example is enough.",
    rate_limited: "Too many uploads this hour.",
    failed: "{name} could not be uploaded.",
  },
};

/** "Draft with AI" (brief §7, step 1): a rubric from the outcome and one example of good work. */
function RubricDraftPanel(props: {
  courseId: string;
  form: React.RefObject<HTMLFormElement | null>;
  lessonCount: number;
  onDraft: (rubric: Rubric, example: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "good" | "error"; text: string } | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [example, setExample] = useState("");
  const [exampleFile, setExampleFile] = useState<string | null>(null);
  const [keep, setKeep] = useState(true);

  const run = () => {
    if (
      props.lessonCount > 0 &&
      !window.confirm(
        "Lessons point at the current criteria. A new rubric replaces them, and those lessons lose their link in the coverage map until you pick criteria again. Draft anyway?",
      )
    ) {
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
      setMessage({
        tone: "good",
        text: "Draft ready below. Read every criterion, change what does not fit, then save.",
      });
    });
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        <Sparkles aria-hidden size={16} /> Draft the rubric with AI
      </button>
    );
  }
  return (
    <div className="space-y-4 rounded-card border border-line bg-subtle p-4">
      <div>
        <p className="font-semibold">Draft the rubric with AI</p>
        <p className="text-sm text-muted">
          Uses the outcome above and, ideally, one example of good work. You review the draft before
          anything is saved.
        </p>
      </div>
      <div className="field">
        <label htmlFor="rubric-example" className="label">
          Example of good work (optional)
        </label>
        <textarea
          id="rubric-example"
          className="textarea min-h-32"
          value={example}
          onChange={(event) => setExample(event.target.value)}
          placeholder="Paste a finished piece of work you would pass without hesitation."
          maxLength={40_000}
        />
      </div>
      <FileUpload
        endpoint={`/api/uploads?purpose=exemplar&course=${props.courseId}`}
        name="exampleFileId"
        accept=".pdf,.md,.txt,application/pdf,text/markdown,text/plain"
        maxFiles={1}
        maxBytes={20 * 1024 * 1024}
        labels={EXAMPLE_UPLOAD_LABELS}
        onChange={(files) => setExampleFile(files[0]?.id ?? null)}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={keep}
          onChange={(event) => setKeep(event.target.checked)}
          className="size-4 accent-(--tenant-primary)"
        />
        Keep the example as a passing calibration example
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary btn-sm" onClick={run} disabled={pending}>
          <Sparkles aria-hidden size={16} /> {pending ? "Drafting…" : "Draft rubric"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Close
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

export function OutcomeForm(props: OutcomeFormProps) {
  const primary = props.languages[0] ?? "en";
  const [draft, setDraft] = useState<RubricDraft>(() => draftFromRubric(props.rubric));
  const { state, pending, onSubmit } = useActionForm<FormState>(async (previous, formData) => {
    const result = await saveOutcomeAction(previous, formData);
    // New criteria keep the ids they were saved with, even if renamed later.
    if (result.ok) setDraft((current) => withSavedIds(current, primary));
    return result;
  }, {});
  const [artifactName, setArtifactName] = useState<LocalizedText>(props.artifactName);
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
            1. What learners build
          </h2>
          <p className="text-sm text-muted">
            Learners see this as their “{props.artifactTerm}”. The name appears on the Certificate
            of Completion.
          </p>
        </div>
        <div className={`grid gap-5 ${twoColumns}`}>
          {props.languages.map((locale, index) => (
            <div key={locale} className="space-y-4">
              <p className="eyebrow">{LANGUAGE_NAMES[locale]}</p>
              <div className="field">
                <label htmlFor={`artifactName.${locale}`} className="label">
                  Name of the work
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
                  Assignment
                </label>
                <textarea
                  id={`prompt.${locale}`}
                  name={`prompt.${locale}`}
                  className="textarea"
                  rows={7}
                  maxLength={4000}
                  required={index === 0}
                  defaultValue={props.prompt[locale] ?? ""}
                />
                <p className="hint">
                  What to hand in, which parts it needs, how long it should be.
                </p>
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
            {describeFinding(nameFindings[0]!)}
          </p>
        )}
      </section>

      <section aria-labelledby="handin-heading" className="card-flat space-y-4 p-5 sm:p-6">
        <div>
          <h2 id="handin-heading" className="text-lg font-semibold">
            2. How learners hand it in
          </h2>
          <p className="text-sm text-muted">
            Pick at least one. The AI review reads text, PDFs, images (through vision), form fields
            and the link.
          </p>
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
              <span className="block text-sm font-semibold">Written text</span>
              <span className="text-xs text-muted">Typed, pasted or a Markdown file.</span>
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
              <span className="block text-sm font-semibold">A PDF</span>
              <span className="text-xs text-muted">A document, slides or a one-pager.</span>
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
              <span className="block text-sm font-semibold">Images</span>
              <span className="text-xs text-muted">Screenshots, photos of a whiteboard.</span>
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
              <span className="block text-sm font-semibold">A link</span>
              <span className="text-xs text-muted">A board, document or prototype.</span>
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
              <span className="block text-sm font-semibold">A template form</span>
              <span className="text-xs text-muted">Named fields, reviewed as structured data.</span>
            </span>
          </label>
        </div>
        {useForm && (
          <div className="field">
            <label htmlFor="formSchema" className="label">
              Form fields (JSON schema)
            </label>
            <textarea
              id="formSchema"
              name="formSchema"
              className="textarea textarea-code"
              rows={9}
              defaultValue={props.formSchema ?? FORM_EXAMPLE}
            />
            <p className="hint">
              An object with text fields: title, description, maxLength; list required fields in
              “required”.
            </p>
          </div>
        )}
        <div className="field max-w-xs">
          <label htmlFor="maxMb" className="label">
            Largest file
          </label>
          <select id="maxMb" name="maxMb" className="select" defaultValue={String(props.maxMb)}>
            {[5, 10, 15, 25, 50].map((mb) => (
              <option key={mb} value={mb}>
                {mb} MB
              </option>
            ))}
          </select>
          <p className="hint">
            Up to 5 files per attempt. Photos are stored without location data.
          </p>
        </div>
      </section>

      <section
        id="rubric"
        aria-labelledby="rubric-heading"
        className="card-flat space-y-5 scroll-mt-6 p-5 sm:p-6"
      >
        <div>
          <h2 id="rubric-heading" className="text-lg font-semibold">
            3. Rubric
          </h2>
          <p className="text-sm text-muted">
            What a reviewer scores. Pass or fail is computed from the scores, never taken from the
            AI. Changing the rubric creates a new version; earlier reviews keep theirs.
          </p>
        </div>
        {props.aiAvailable && (
          <RubricDraftPanel
            courseId={props.courseId}
            form={formRef}
            lessonCount={props.lessonCount}
            onDraft={(rubric, example) =>
              setDraft((current) => {
                const drafted = draftFromRubric(rubric);
                return {
                  ...drafted,
                  // New criteria: ids are given on save, from the labels.
                  criteria: drafted.criteria.map((criterion, index) => ({
                    ...criterion,
                    key: `ai-${Date.now()}-${index}`,
                    id: "",
                  })),
                  policy: current.policy,
                  exemplars: example
                    ? [
                        ...current.exemplars.filter((exemplar) => exemplar.id !== "ai-example"),
                        { id: "ai-example", expected_pass: true, content: example },
                      ].slice(-10)
                    : current.exemplars,
                };
              })
            }
          />
        )}
        <RubricEditor draft={draft} onChange={setDraft} languages={props.languages} />
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 space-y-3 border-t border-line bg-surface/95 px-4 py-4 backdrop-blur-sm sm:mx-0 sm:rounded-card sm:border">
        <FormFeedback state={state} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">Saved changes apply to new submissions.</p>
          <SubmitButton pending={pending} pendingLabel="Saving…">
            Save outcome and rubric
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
