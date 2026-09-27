"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { FormState } from "@/app/studio/actions";
import { text } from "@/app/studio/form-data";
import { INVITATIONS_PER_DAY } from "@/core/access/team";
import type { StudioText } from "@/core/i18n/studio/translator";
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
import { getStudioText } from "@/server/studio-text";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function cohortInput(
  t: StudioText,
  formData: FormData,
): { name: string; startsOn: string | null; endsOn: string | null } | string {
  const name = text(formData, "name").slice(0, 80);
  const startsOn = text(formData, "startsOn") || null;
  const endsOn = text(formData, "endsOn") || null;
  if (!name) return t.t("team.cohorts.actions.nameRequired");
  if ((startsOn && !DATE.test(startsOn)) || (endsOn && !DATE.test(endsOn)))
    return t.t("team.cohorts.actions.dates");
  if (startsOn && endsOn && endsOn < startsOn) return t.t("team.cohorts.actions.endBeforeStart");
  return { name, startsOn, endsOn };
}

export async function createCohortAction(_: FormState, formData: FormData): Promise<FormState> {
  const { tenant, viewer } = await requireCapability("cohorts.manage", "/studio/cohorts");
  const t = await getStudioText();
  const input = cohortInput(t, formData);
  if (typeof input === "string") return { errors: [input] };
  const id = await createCohort(getDb(), tenant.id, {
    ...input,
    courseId: text(formData, "courseId"),
    createdBy: viewer.userId,
  });
  if (!id) return { errors: [t.t("team.cohorts.actions.chooseCourse")] };
  redirect(`/studio/cohorts/${id}?created=1`);
}

export async function updateCohortAction(_: FormState, formData: FormData): Promise<FormState> {
  const cohortId = text(formData, "cohortId");
  const { tenant } = await requireCapability("cohorts.manage", `/studio/cohorts/${cohortId}`);
  const t = await getStudioText();
  const input = cohortInput(t, formData);
  if (typeof input === "string") return { errors: [input] };
  await updateCohort(getDb(), tenant.id, cohortId, {
    ...input,
    status: formData.get("status") === "closed" ? "closed" : "open",
  });
  revalidatePath(`/studio/cohorts/${cohortId}`);
  return { ok: true, message: t.t("team.cohorts.actions.saved") };
}

export async function addMentorAction(_: FormState, formData: FormData): Promise<FormState> {
  const cohortId = text(formData, "cohortId");
  const { tenant } = await requireCapability("cohorts.manage", `/studio/cohorts/${cohortId}`);
  const t = await getStudioText();
  const result = await addMentor(getDb(), tenant.id, cohortId, text(formData, "email"), t.locale);
  if (!result.ok) {
    return {
      errors: [
        result.error === "limit"
          ? t.t("team.members.error.limit", { max: INVITATIONS_PER_DAY })
          : t.t("team.cohorts.actions.mentorEmail"),
      ],
    };
  }
  revalidatePath(`/studio/cohorts/${cohortId}`);
  return {
    ok: true,
    message: t.t(
      result.invited ? "team.cohorts.actions.mentorInvited" : "team.cohorts.actions.mentorAdded",
    ),
  };
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
