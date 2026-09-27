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
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";

function DateFields(props: { startsOn?: string | null; endsOn?: string | null }) {
  return (
    <>
      <div className="field">
        <label htmlFor="cohort-start" className="label">
          Starts
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
          Ends
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
  const { state, pending, onSubmit } = useActionForm<FormState>(createCohortAction, {});
  return (
    <form onSubmit={onSubmit} className="card-flat space-y-4 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">New cohort</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="cohort-course" className="label">
            Course
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
            Name
          </label>
          <input
            id="cohort-name"
            name="name"
            className="input"
            placeholder="Autumn 2026"
            maxLength={80}
            required
          />
        </div>
        <DateFields />
      </div>
      <FormFeedback state={state} />
      <SubmitButton pending={pending} pendingLabel="Creating…">
        <Plus aria-hidden size={18} /> Create cohort
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
  const { state, pending, onSubmit } = useActionForm<FormState>(updateCohortAction, {});
  return (
    <form onSubmit={onSubmit} className="card-flat space-y-4 p-5 sm:p-6">
      <input type="hidden" name="cohortId" value={props.cohortId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field sm:col-span-2">
          <label htmlFor="cohort-name" className="label">
            Name
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
          Closed: the join link stops working
          <span className="block text-xs text-muted">Everyone already in it keeps going.</span>
        </span>
      </label>
      <FormFeedback state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save cohort
      </SubmitButton>
    </form>
  );
}

export function AddMentorForm(props: { cohortId: string }) {
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
          Mentor e-mail address
        </label>
        <input
          id="mentor-email"
          name="email"
          type="email"
          className="input min-w-56 flex-1"
          placeholder="mentor@your-company.com"
          required
        />
        <SubmitButton pending={pending} pendingLabel="Adding…" className="btn btn-secondary">
          <UserPlus aria-hidden size={18} /> Add mentor
        </SubmitButton>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}
