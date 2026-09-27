"use client";

import { Send, UserMinus, UserPlus } from "lucide-react";
import { useEffect, useRef } from "react";

import type { FormState } from "@/app/studio/actions";
import {
  changeRolesAction,
  inviteMemberAction,
  removeMemberAction,
  resendInvitationAction,
} from "@/app/studio/settings/team/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import { ACADEMY_ROLES, type AcademyRole } from "@/core/access/team";

/** One checkbox per academy-wide role, with what it may do. */
function RoleChoices(props: {
  idPrefix: string;
  checked?: readonly AcademyRole[];
  /** The last admin keeps the role: shown ticked, sent along, not changeable. */
  lockAdmin?: boolean;
}) {
  const t = useStudioText();
  return (
    <div className="grid gap-2 md:grid-cols-3">
      {ACADEMY_ROLES.map((role) => {
        const locked = role === "tenant_admin" && props.lockAdmin;
        return (
          <label
            key={role}
            htmlFor={`${props.idPrefix}-${role}`}
            className="flex gap-3 rounded-control border border-line p-3"
          >
            <input
              id={`${props.idPrefix}-${role}`}
              type="checkbox"
              name="roles"
              value={role}
              defaultChecked={props.checked?.includes(role) || locked}
              disabled={locked}
              className="mt-1 size-4 shrink-0 accent-(--tenant-primary)"
            />
            {locked && <input type="hidden" name="roles" value={role} />}
            <span>
              <span className="block text-sm font-semibold">
                {t.t(`team.members.role.${role}`)}
              </span>
              <span className="text-xs text-muted">{t.t(`team.members.roleHint.${role}`)}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function InviteForm(props: { academy: string; max: number; mentorsHint: boolean }) {
  const t = useStudioText();
  const { state, pending, onSubmit } = useActionForm<FormState>(inviteMemberAction, {});
  const form = useRef<HTMLFormElement>(null);
  // Invited: the person is in the list above; the form is free for the next one.
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return (
    <form
      ref={form}
      onSubmit={onSubmit}
      aria-labelledby="invite-heading"
      className="card-flat space-y-4 p-5 sm:p-6"
    >
      <div>
        <h2 id="invite-heading" className="text-lg font-semibold">
          {t.t("team.members.invite.heading")}
        </h2>
        <p className="text-sm text-muted">
          {t.t("team.members.invite.intro", { academy: props.academy, max: props.max })}
        </p>
      </div>
      <div className="field">
        <label htmlFor="invite-email" className="label">
          {t.t("team.members.invite.email")}
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          className="input"
          placeholder={t.t("team.members.invite.placeholder")}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          required
        />
      </div>
      <fieldset className="field">
        <legend className="label mb-1.5">{t.t("team.members.invite.roles")}</legend>
        <RoleChoices idPrefix="invite-role" />
        {props.mentorsHint && <p className="hint">{t.t("team.members.mentorsHint")}</p>}
      </fieldset>
      <FormFeedback state={state} />
      <SubmitButton pending={pending} pendingLabel={t.t("team.members.sending")}>
        <UserPlus aria-hidden size={18} /> {t.t("team.members.invite.submit")}
      </SubmitButton>
    </form>
  );
}

export function RolesForm(props: {
  userId: string;
  email: string;
  roles: readonly AcademyRole[];
  onlyAdmin: boolean;
}) {
  const t = useStudioText();
  const { state, pending, onSubmit } = useActionForm<FormState>(changeRolesAction, {});
  return (
    <form onSubmit={onSubmit} className="space-y-3 pt-3">
      <input type="hidden" name="userId" value={props.userId} />
      <fieldset className="field">
        <legend className="sr-only">
          {t.t("team.members.editRoles")}: {props.email}
        </legend>
        <RoleChoices
          idPrefix={`roles-${props.userId}`}
          checked={props.roles}
          lockAdmin={props.onlyAdmin}
        />
        {props.onlyAdmin && <p className="hint">{t.t("team.members.onlyAdmin")}</p>}
      </fieldset>
      <FormFeedback state={state} />
      <SubmitButton
        pending={pending}
        pendingLabel={t.t("common.saving")}
        className="btn btn-secondary btn-sm"
      >
        {t.t("team.members.saveRoles")}
      </SubmitButton>
    </form>
  );
}

export function RemoveMemberForm(props: { userId: string; email: string }) {
  const t = useStudioText();
  const { state, pending, onSubmit } = useActionForm<FormState>(removeMemberAction, {});
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="userId" value={props.userId} />
      <SubmitButton
        pending={pending}
        className="btn btn-ghost btn-sm"
        confirm={t.t("team.members.removeConfirm", { email: props.email })}
      >
        <UserMinus aria-hidden size={16} /> {t.t("team.members.remove")}
      </SubmitButton>
      <FormFeedback state={{ errors: state.errors }} />
    </form>
  );
}

/** For someone who has not signed in yet; `again` once an invitation went out before. */
export function ResendInvitationForm(props: { userId: string; again: boolean }) {
  const t = useStudioText();
  const { state, pending, onSubmit } = useActionForm<FormState>(resendInvitationAction, {});
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="userId" value={props.userId} />
      <SubmitButton
        pending={pending}
        pendingLabel={t.t("team.members.sending")}
        className="btn btn-ghost btn-sm"
      >
        <Send aria-hidden size={16} />{" "}
        {t.t(props.again ? "team.members.resend" : "team.members.invite.submit")}
      </SubmitButton>
      <FormFeedback state={state} />
    </form>
  );
}
