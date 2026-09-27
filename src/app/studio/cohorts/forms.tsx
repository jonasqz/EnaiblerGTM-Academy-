"use client";

import { Plus, UserPlus } from "lucide-react";
import { useEffect, useRef } from "react";

import type { FormState } from "@/app/studio/actions";
import {
  addMentorAction,
  createCohortAction,
  updateCohortAction,
} from "@/app/studio/cohorts/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";

function DateFields(props: { startsOn?: string | null; endsOn?: string | null }) {
  const t = useStudioText();
  return (
    <>
      <div className="field">
        <label htmlFor="cohort-start" className="label">
          {t.t("team.cohorts.starts")}
        </label>
        <input
          id="cohort-start"
          name="startsOn"
          type="date"
          className="input"
          defaultValue={props.startsOn ?? ""}
        />
      </div>
      <div className="field">
        <label htmlFor="cohort-end" className="label">
          {t.t("team.cohorts.ends")}
        </label>
        <input
          id="cohort-end"
          name="endsOn"
          type="date"
          className="input"
          defaultValue={props.endsOn ?? ""}
        />
      </div>
    </>
  );
}

export function NewCohortForm(props: { courses: Array<{ id: string; label: string }> }) {
  const t = useStudioText();
  const { state, pending, onSubmit } = useActionForm<FormState>(createCohortAction, {});
  return (
    <form onSubmit={onSubmit} className="card-flat space-y-4 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{t.t("team.cohorts.new")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="cohort-course" className="label">
            {t.t("team.cohorts.course")}
          </label>
          <select id="cohort-course" name="courseId" className="select" required>
            {props.courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cohort-name" className="label">
            {t.t("team.cohorts.name")}
          </label>
          <input
            id="cohort-name"
            name="name"
            className="input"
            placeholder={t.t("team.cohorts.namePlaceholder")}
            maxLength={80}
            required
          />
        </div>
        <DateFields />
      </div>
      <FormFeedback state={state} />
      <SubmitButton pending={pending} pendingLabel={t.t("team.cohorts.creating")}>
        <Plus aria-hidden size={18} /> {t.t("team.cohorts.create")}
      </SubmitButton>
    </form>
  );
}

export function CohortForm(props: {
  cohortId: string;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  status: "open" | "closed";
}) {
  const t = useStudioText();
  const { state, pending, onSubmit } = useActionForm<FormState>(updateCohortAction, {});
  return (
    <form onSubmit={onSubmit} className="card-flat space-y-4 p-5 sm:p-6">
      <input type="hidden" name="cohortId" value={props.cohortId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field sm:col-span-2">
          <label htmlFor="cohort-name" className="label">
            {t.t("team.cohorts.name")}
          </label>
          <input
            id="cohort-name"
            name="name"
            className="input"
            defaultValue={props.name}
            maxLength={80}
            required
          />
        </div>
        <DateFields startsOn={props.startsOn} endsOn={props.endsOn} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="status"
          value="closed"
          defaultChecked={props.status === "closed"}
          className="mt-0.5 size-4"
        />
        <span>
          {t.t("team.cohorts.closedLabel")}
          <span className="block text-xs text-muted">{t.t("team.cohorts.closedHint")}</span>
        </span>
      </label>
      <FormFeedback state={state} />
      <SubmitButton pending={pending} pendingLabel={t.t("common.saving")}>
        {t.t("team.cohorts.save")}
      </SubmitButton>
    </form>
  );
}

export function AddMentorForm(props: { cohortId: string }) {
  const t = useStudioText();
  const { state, pending, onSubmit } = useActionForm<FormState>(addMentorAction, {});
  const form = useRef<HTMLFormElement>(null);
  // Added: the mentor is in the list above; the field is free for the next one.
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="cohortId" value={props.cohortId} />
      <div className="flex flex-wrap gap-2">
        <label htmlFor="mentor-email" className="sr-only">
          {t.t("team.cohorts.mentorEmail")}
        </label>
        <input
          id="mentor-email"
          name="email"
          type="email"
          className="input min-w-56 flex-1"
          placeholder={t.t("team.cohorts.mentorPlaceholder")}
          required
        />
        <SubmitButton
          pending={pending}
          pendingLabel={t.t("common.adding")}
          className="btn btn-secondary"
        >
          <UserPlus aria-hidden size={18} /> {t.t("team.cohorts.addMentor")}
        </SubmitButton>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}
