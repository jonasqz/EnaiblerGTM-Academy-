"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { FormState } from "@/app/studio/actions";
import { saveFormAction } from "@/app/studio/webinars/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import {
  FORM_FIELD_KINDS,
  fieldId,
  type FormFieldKind,
  type RegistrationForm,
} from "@/core/webinars/landing";

interface FieldDraft {
  key: number;
  /** Kept once saved: answers are stored under it. */
  id: string;
  kind: FormFieldKind;
  label: string;
  required: boolean;
  options: string;
}

let counter = 0;

/** The registration form (webinar brief §2.2): the name field, own questions, consents offered. */
export function FormBuilder(props: { webinarId: string; form: RegistrationForm; academy: string }) {
  const t = useStudioText();
  const { state, pending, onSubmit } = useActionForm<FormState>(saveFormAction, {});
  const [name, setName] = useState(props.form.name);
  const [marketing, setMarketing] = useState(props.form.consents.marketing);
  const [leadHandoff, setLeadHandoff] = useState(props.form.consents.lead_handoff);
  const [fields, setFields] = useState<FieldDraft[]>(() =>
    props.form.fields.map((field) => ({
      key: ++counter,
      id: field.id,
      kind: field.kind,
      label: field.label,
      required: field.required,
      options: (field.options ?? []).join("\n"),
    })),
  );
  const update = (key: number, change: Partial<FieldDraft>) =>
    setFields((current) =>
      current.map((field) => (field.key === key ? { ...field, ...change } : field)),
    );
  const move = (index: number, by: number) =>
    setFields((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item!);
      return next;
    });

  const taken: string[] = [];
  const serialized: RegistrationForm = {
    name,
    consents: { marketing, lead_handoff: leadHandoff },
    fields: fields.map((field) => {
      const id = field.id || fieldId(field.label, taken);
      taken.push(id);
      const options = field.options
        .split("\n")
        .map((option) => option.trim())
        .filter(Boolean);
      return {
        id,
        kind: field.kind,
        label: field.label.trim(),
        required: field.required,
        ...(field.kind === "select" ? { options } : {}),
      };
    }),
  };

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-5">
      <input type="hidden" name="webinarId" value={props.webinarId} />
      <input type="hidden" name="form" value={JSON.stringify(serialized)} />
      <p className="text-sm text-muted">{t.t("webinars.form.intro")}</p>

      <fieldset className="card-flat space-y-2 p-4">
        {/* Floated, the legend sits inside the card instead of on its border. */}
        <legend className="float-left w-full pb-1 font-semibold">
          {t.t("webinars.form.name")}
        </legend>
        {(["required", "optional", "off"] as const).map((mode) => (
          <label key={mode} className="clear-left flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="nameMode"
              checked={name === mode}
              onChange={() => setName(mode)}
              className="size-4"
            />
            {t.t(`webinars.form.name.${mode}`)}
          </label>
        ))}
      </fieldset>

      <section className="space-y-3" aria-labelledby="fields-heading">
        <h2 id="fields-heading" className="font-semibold">
          {t.t("webinars.form.fields")}
        </h2>
        {fields.map((field, index) => (
          <div key={field.key} className="card-flat space-y-3 p-4">
            <div className="flex flex-wrap items-end gap-2">
              <label className="field min-w-48 flex-1">
                <span className="label">{t.t("webinars.form.label")}</span>
                <input
                  className="input"
                  maxLength={160}
                  value={field.label}
                  onChange={(event) => update(field.key, { label: event.target.value })}
                  required
                />
              </label>
              <label className="field">
                <span className="sr-only">{t.t("webinars.form.label")}</span>
                <select
                  className="select"
                  value={field.kind}
                  onChange={(event) =>
                    update(field.key, { kind: event.target.value as FormFieldKind })
                  }
                >
                  {FORM_FIELD_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t.t(`webinars.form.kind.${kind}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {field.kind === "select" && (
              <label className="field">
                <span className="label">{t.t("webinars.form.options")}</span>
                <textarea
                  className="textarea"
                  rows={3}
                  value={field.options}
                  onChange={(event) => update(field.key, { options: event.target.value })}
                />
              </label>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex flex-1 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(event) => update(field.key, { required: event.target.checked })}
                  className="size-4"
                />
                {t.t("webinars.form.required")}
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                aria-label={t.t("webinars.page.moveUp")}
                title={t.t("webinars.page.moveUp")}
              >
                <ArrowUp aria-hidden size={16} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={index === fields.length - 1}
                onClick={() => move(index, 1)}
                aria-label={t.t("webinars.page.moveDown")}
                title={t.t("webinars.page.moveDown")}
              >
                <ArrowDown aria-hidden size={16} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  setFields((current) => current.filter((item) => item.key !== field.key))
                }
              >
                <Trash2 aria-hidden size={16} /> {t.t("webinars.form.removeField")}
              </button>
            </div>
          </div>
        ))}
        {fields.length < 10 && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() =>
              setFields((current) => [
                ...current,
                { key: ++counter, id: "", kind: "text", label: "", required: false, options: "" },
              ])
            }
          >
            <Plus aria-hidden size={16} /> {t.t("webinars.form.addField")}
          </button>
        )}
      </section>

      <fieldset className="card-flat space-y-3 p-4">
        <legend className="float-left w-full pb-1 font-semibold">
          {t.t("webinars.form.consents")}
        </legend>
        <p className="hint clear-left">{t.t("webinars.form.consentsHint")}</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={marketing}
            onChange={(event) => setMarketing(event.target.checked)}
            className="size-4"
          />
          {t.t("webinars.form.marketing")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={leadHandoff}
            onChange={(event) => setLeadHandoff(event.target.checked)}
            className="size-4"
          />
          {t.t("webinars.form.leadHandoff", { academy: props.academy })}
        </label>
      </fieldset>

      <FormFeedback state={state} />
      <SubmitButton pending={pending} pendingLabel={t.t("common.saving")}>
        {t.t("webinars.form.save")}
      </SubmitButton>
    </form>
  );
}
