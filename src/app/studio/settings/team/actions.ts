"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { FormState } from "@/app/studio/actions";
import { text } from "@/app/studio/form-data";
import { academyRolesFrom, INVITATIONS_PER_DAY } from "@/core/access/team";
import type { StudioText } from "@/core/i18n/studio/translator";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { getStudioText } from "@/server/studio-text";
import {
  changeTeamRoles,
  inviteToTeam,
  removeFromTeam,
  resendInvitation,
  type TeamError,
} from "@/server/team";

const PAGE = "/studio/settings/team";

function failed(t: StudioText, error: TeamError): FormState {
  return { errors: [t.t(`team.members.error.${error}`, { max: INVITATIONS_PER_DAY })] };
}

/** The person a row's form is about; anything else simply finds nobody. */
function member(formData: FormData): string {
  return text(formData, "userId").slice(0, 200);
}

export async function inviteMemberAction(_: FormState, formData: FormData): Promise<FormState> {
  const { tenant, viewer } = await requireCapability("academy.manage", PAGE);
  const t = await getStudioText();
  const roles = academyRolesFrom(formData.getAll("roles"));
  const result = await inviteToTeam(getDb(), tenant, {
    actorId: viewer.userId,
    email: text(formData, "email"),
    roles,
    locale: t.locale,
  });
  if (!result.ok) return failed(t, result.error);
  // Your own address changes your own roles, like the form in your row.
  if (result.email === viewer.email.toLowerCase()) {
    revalidatePath("/studio", "layout");
    if (!roles.includes("tenant_admin")) redirect("/studio");
  }
  revalidatePath(PAGE);
  return {
    ok: true,
    message: t.t(`team.members.done.${result.status}`, { email: result.email }),
  };
}

export async function changeRolesAction(_: FormState, formData: FormData): Promise<FormState> {
  const { tenant, viewer } = await requireCapability("academy.manage", PAGE);
  const t = await getStudioText();
  const userId = member(formData);
  const roles = academyRolesFrom(formData.getAll("roles"));
  const result = await changeTeamRoles(getDb(), tenant, { actorId: viewer.userId, userId, roles });
  if (!result.ok) {
    return result.error === "no_roles"
      ? { errors: [t.t("team.members.error.noRolesLeft")] }
      : failed(t, result.error);
  }
  revalidatePath("/studio", "layout");
  // An admin who gave up the role has no settings to come back to.
  if (userId === viewer.userId && !roles.includes("tenant_admin")) redirect("/studio");
  return { ok: true, message: t.t("team.members.done.roles") };
}

export async function removeMemberAction(_: FormState, formData: FormData): Promise<FormState> {
  const { tenant, viewer } = await requireCapability("academy.manage", PAGE);
  const t = await getStudioText();
  const userId = member(formData);
  const result = await removeFromTeam(getDb(), tenant, { actorId: viewer.userId, userId });
  if (!result.ok) return failed(t, result.error);
  revalidatePath("/studio", "layout");
  // Off the team, the Studio is gone: back to the academy as a learner.
  if (userId === viewer.userId) redirect("/");
  return { ok: true, message: t.t("team.members.done.removed") };
}

export async function resendInvitationAction(_: FormState, formData: FormData): Promise<FormState> {
  const { tenant, viewer } = await requireCapability("academy.manage", PAGE);
  const t = await getStudioText();
  const result = await resendInvitation(getDb(), tenant, {
    actorId: viewer.userId,
    userId: member(formData),
    locale: t.locale,
  });
  if (!result.ok) return failed(t, result.error);
  revalidatePath(PAGE);
  return { ok: true, message: t.t("team.members.done.resent") };
}
