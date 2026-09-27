"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { FormState } from "@/app/studio/actions";
import { text } from "@/app/studio/form-data";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import {
  addMentor,
  createCohort,
  deleteCohort,
  removeCohortMember,
  removeMentor,
  updateCohort,
} from "@/server/cohorts";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function cohortInput(
  formData: FormData,
): { name: string; startsOn: string | null; endsOn: string | null } | string {
  const name = text(formData, "name").slice(0, 80);
  const startsOn = text(formData, "startsOn") || null;
  const endsOn = text(formData, "endsOn") || null;
  if (!name) return "Give the cohort a name, e.g. “Autumn 2026”.";
  if ((startsOn && !DATE.test(startsOn)) || (endsOn && !DATE.test(endsOn)))
    return "Use valid dates.";
  if (startsOn && endsOn && endsOn < startsOn) return "The end date is before the start date.";
  return { name, startsOn, endsOn };
}

export async function createCohortAction(_: FormState, formData: FormData): Promise<FormState> {
  const { tenant, viewer } = await requireCapability("cohorts.manage", "/studio/cohorts");
  const input = cohortInput(formData);
  if (typeof input === "string") return { errors: [input] };
  const id = await createCohort(getDb(), tenant.id, {
    ...input,
    courseId: text(formData, "courseId"),
    createdBy: viewer.userId,
  });
  if (!id) return { errors: ["Choose a course."] };
  redirect(`/studio/cohorts/${id}?created=1`);
}

export async function updateCohortAction(_: FormState, formData: FormData): Promise<FormState> {
  const cohortId = text(formData, "cohortId");
  const { tenant } = await requireCapability("cohorts.manage", `/studio/cohorts/${cohortId}`);
  const input = cohortInput(formData);
  if (typeof input === "string") return { errors: [input] };
  await updateCohort(getDb(), tenant.id, cohortId, {
    ...input,
    status: formData.get("status") === "closed" ? "closed" : "open",
  });
  revalidatePath(`/studio/cohorts/${cohortId}`);
  return { ok: true, message: "Cohort saved." };
}

export async function addMentorAction(_: FormState, formData: FormData): Promise<FormState> {
  const cohortId = text(formData, "cohortId");
  const { tenant } = await requireCapability("cohorts.manage", `/studio/cohorts/${cohortId}`);
  const added = await addMentor(getDb(), tenant.id, cohortId, text(formData, "email"));
  if (!added) return { errors: ["Enter the mentor's e-mail address."] };
  revalidatePath(`/studio/cohorts/${cohortId}`);
  return { ok: true, message: "Mentor added. They sign in with this address." };
}

export async function removeMentorAction(formData: FormData): Promise<void> {
  const cohortId = text(formData, "cohortId");
  const { tenant } = await requireCapability("cohorts.manage", `/studio/cohorts/${cohortId}`);
  await removeMentor(getDb(), tenant.id, cohortId, text(formData, "userId"));
  revalidatePath(`/studio/cohorts/${cohortId}`);
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const cohortId = text(formData, "cohortId");
  const { tenant } = await requireCapability("cohorts.manage", `/studio/cohorts/${cohortId}`);
  await removeCohortMember(getDb(), tenant.id, cohortId, text(formData, "userId"));
  revalidatePath(`/studio/cohorts/${cohortId}`);
}

export async function deleteCohortAction(formData: FormData): Promise<void> {
  const cohortId = text(formData, "cohortId");
  const { tenant } = await requireCapability("cohorts.manage", `/studio/cohorts/${cohortId}`);
  await deleteCohort(getDb(), tenant.id, cohortId);
  redirect("/studio/cohorts");
}
