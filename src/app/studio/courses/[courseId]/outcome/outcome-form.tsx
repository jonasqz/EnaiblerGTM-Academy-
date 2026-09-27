"use client";

import { useState } from "react";

import { saveOutcomeAction, type FormState } from "@/app/studio/actions";
import {
  draftFromRubric,
  RubricEditor,
  serializeRubric,
  withSavedIds,
  type RubricDraft,
} from "@/app/studio/courses/[courseId]/outcome/rubric-editor";
import { FormFeedback } from "@/components/studio/form-feedback";
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
  const twoColumns = props.languages.length > 1 ? "lg:grid-cols-2" : "";
  const nameFindings = lintLocalizedWording(artifactName, "artifact_name");

  return (
    <form onSubmit={onSubmit} className="space-y-8">
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
