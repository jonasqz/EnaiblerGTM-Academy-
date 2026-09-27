"use client";

import { useState } from "react";

import type { FormState } from "@/app/studio/actions";
import { addExemplarAction } from "@/app/studio/courses/[courseId]/calibrate/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { FileUpload } from "@/components/ui/file-upload";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import { studioUploadLabels } from "@/core/i18n/studio/helpers";

export function ExemplarForm(props: {
  courseId: string;
  criteria: Array<{ id: string; label: string; scores: number[] }>;
}) {
  const t = useStudioText();
  const [resetKey, setResetKey] = useState(0);
  const [fileId, setFileId] = useState<string | null>(null);
  const { state, pending, onSubmit } = useActionForm<FormState>(async (previous, formData) => {
    const result = await addExemplarAction(previous, formData);
    if (result.ok) {
      setResetKey((value) => value + 1);
      setFileId(null);
    }
    return result;
  }, {});

  return (
    <form key={resetKey} onSubmit={onSubmit} className="card space-y-5 p-5 sm:p-6">
      <div>
        <h3 className="text-lg font-semibold">{t.t("authoring.exemplar.heading")}</h3>
        <p className="text-sm text-muted">{t.t("authoring.exemplar.intro")}</p>
      </div>
      <input type="hidden" name="courseId" value={props.courseId} />
      {fileId && <input type="hidden" name="fileId" value={fileId} />}
      <div className="field">
        <label htmlFor="exemplar-title" className="label">
          {t.t("authoring.exemplar.titleLabel")}{" "}
          <span className="font-normal text-muted">({t.t("common.optional")})</span>
        </label>
        <input
          id="exemplar-title"
          name="title"
          className="input"
          maxLength={120}
          placeholder={t.t("authoring.exemplar.titlePlaceholder")}
        />
      </div>
      <div className="field">
        <label htmlFor="exemplar-content" className="label">
          {t.t("authoring.exemplar.content")}
        </label>
        <textarea
          id="exemplar-content"
          name="content"
          className="textarea min-h-40"
          maxLength={40_000}
        />
      </div>
      <FileUpload
        endpoint={`/api/uploads?purpose=exemplar&course=${props.courseId}`}
        name="uploaded"
        accept=".pdf,.md,.txt,application/pdf,text/markdown,text/plain"
        maxFiles={1}
        maxBytes={20 * 1024 * 1024}
        labels={studioUploadLabels(t)}
        onChange={(files) => setFileId(files[0]?.id ?? null)}
      />
      <fieldset className="space-y-2">
        <legend className="label">{t.t("authoring.exemplar.judgement")}</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="expected"
              value="pass"
              required
              className="size-4 accent-(--tenant-primary)"
            />
            {t.t("authoring.exemplar.pass")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="expected"
              value="fail"
              className="size-4 accent-(--tenant-primary)"
            />
            {t.t("authoring.exemplar.fail")}
          </label>
        </div>
      </fieldset>
      <details className="rounded-control border border-line p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          {t.t("authoring.exemplar.scores")}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {props.criteria.map((criterion) => (
            <div key={criterion.id} className="field">
              <label htmlFor={`score-${criterion.id}`} className="label">
                {criterion.label}
              </label>
              <select
                id={`score-${criterion.id}`}
                name={`score.${criterion.id}`}
                className="select"
                defaultValue=""
              >
                <option value="">{t.t("authoring.exemplar.notScored")}</option>
                {criterion.scores.map((score) => (
                  <option key={score} value={score}>
                    {score}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </details>
      <div className="field">
        <label htmlFor="exemplar-notes" className="label">
          {t.t("authoring.exemplar.notes")}{" "}
          <span className="font-normal text-muted">({t.t("common.optional")})</span>
        </label>
        <input id="exemplar-notes" name="notes" className="input" maxLength={2000} />
      </div>
      <FormFeedback state={state} />
      <SubmitButton pending={pending} pendingLabel={t.t("common.adding")}>
        {t.t("authoring.exemplar.add")}
      </SubmitButton>
    </form>
  );
}
