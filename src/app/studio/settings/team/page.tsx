import { CircleCheck, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  InviteForm,
  RemoveMemberForm,
  ResendInvitationForm,
  RolesForm,
} from "@/app/studio/settings/team/forms";
import { Badge } from "@/components/ui/badge";
import { INVITATIONS_PER_DAY } from "@/core/access/team";
import type { StudioText } from "@/core/i18n/studio/translator";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { getStudioText } from "@/server/studio-text";
import { listTeam, type TeamMember } from "@/server/team";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("team.members.tab") };
}

function Status(props: { t: StudioText; member: TeamMember }) {
  const { t, member } = props;
  if (member.signedIn) {
    return (
      <Badge tone="good" icon={CircleCheck}>
        {t.t("team.members.signedIn")}
      </Badge>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Badge tone="info" icon={Clock}>
        {t.t("team.members.notSignedIn")}
      </Badge>
      {member.invitedAt && (
        <span className="text-xs text-muted">
          {t.t("team.members.invitedAt", { date: t.date(member.invitedAt, "dateTime") })}
        </span>
      )}
    </span>
  );
}

/** Who works in the Studio (brief §4, Membership): invite, change roles, remove. */
export default async function TeamPage() {
  const { tenant, viewer } = await requireCapability("academy.manage", "/studio/settings/team");
  const t = await getStudioText();
  const team = await listTeam(getDb(), tenant.id);
  const admins = team.filter((member) => member.roles.includes("tenant_admin"));
  const cohortsOn = tenant.settings.features.cohorts;

  return (
    <div className="max-w-3xl space-y-6">
      <section aria-labelledby="team-heading" className="card-flat space-y-3 p-5 sm:p-6">
        <div>
          <h2 id="team-heading" className="text-lg font-semibold">
            {t.t("team.members.heading")}
          </h2>
          <p className="text-sm text-muted">
            {t.t("team.members.intro", { academy: tenant.settings.author_display_name })}
          </p>
        </div>
        <ul className="divide-y divide-line" aria-label={t.t("team.members.caption")}>
          {team.map((member) => {
            const onlyAdmin = admins.length === 1 && admins[0]!.userId === member.userId;
            return (
              <li key={member.userId} className="space-y-2 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="break-all font-semibold">
                      {member.email}
                      {member.userId === viewer.userId && (
                        <span className="ml-2 text-sm font-normal text-muted">
                          ({t.t("team.members.you")})
                        </span>
                      )}
                    </p>
                    {member.name && <p className="text-sm text-muted">{member.name}</p>}
                    <p className="flex flex-wrap gap-1.5">
                      {member.roles.map((role) => (
                        <Badge key={role}>{t.t(`team.members.role.${role}`)}</Badge>
                      ))}
                      {member.mentorOf && (
                        <Badge>
                          {member.mentorOf.length > 0
                            ? t.t("team.members.mentorOf", { cohorts: t.list(member.mentorOf) })
                            : t.t("team.members.mentorWithoutCohort")}
                        </Badge>
                      )}
                    </p>
                  </div>
                  <Status t={t} member={member} />
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  {!member.signedIn && (
                    <ResendInvitationForm
                      userId={member.userId}
                      again={member.invitedAt !== null}
                    />
                  )}
                  {!onlyAdmin && <RemoveMemberForm userId={member.userId} email={member.email} />}
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer font-semibold">
                    {t.t("team.members.editRoles")}
                  </summary>
                  <RolesForm
                    userId={member.userId}
                    email={member.email}
                    roles={member.roles}
                    onlyAdmin={onlyAdmin}
                  />
                </details>
                {member.mentorOf && cohortsOn && (
                  <p className="hint">
                    <Link href="/studio/cohorts" className="underline underline-offset-2">
                      {t.t("team.members.mentorsHint")}
                    </Link>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <InviteForm
        academy={tenant.settings.author_display_name}
        max={INVITATIONS_PER_DAY}
        mentorsHint={cohortsOn}
      />
    </div>
  );
}
