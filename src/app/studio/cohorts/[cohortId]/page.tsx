import { ArrowLeft, Link2, Trash, UserMinus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  deleteCohortAction,
  removeMemberAction,
  removeMentorAction,
} from "@/app/studio/cohorts/actions";
import { AddMentorForm, CohortForm } from "@/app/studio/cohorts/forms";
import { cohortDates } from "@/core/i18n/studio/helpers";
import { LearnersTable } from "@/components/studio/learners-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { can } from "@/core/access/roles";
import { localize } from "@/core/i18n/locales";
import { getDb } from "@/db/client";
import { getStudioText } from "@/server/studio-text";
import { requireCapability } from "@/server/access";
import { loadCohort } from "@/server/cohorts";
import { academyUrl } from "@/server/platform/config";
import { courseLearners } from "@/server/studio/insights";

export const metadata: Metadata = { title: "Cohort" };

/** One cohort: its join link, learners and mentors. Mentors see it read-only. */
export default async function CohortPage({
  params,
  searchParams,
}: PageProps<"/studio/cohorts/[cohortId]">) {
  const { cohortId } = await params;
  const { created } = await searchParams;
  const { tenant, roles, viewer } = await requireCapability(
    "studio.view",
    `/studio/cohorts/${cohortId}`,
  );
  const t = await getStudioText();
  const data = await loadCohort(getDb(), tenant.id, cohortId);
  if (!data) notFound();
  const manager = can(roles, "cohorts.manage");
  if (!manager && !data.mentors.some((mentor) => mentor.userId === viewer.userId)) notFound();
  const { cohort, course } = data;
  const rows = await courseLearners(
    getDb(),
    tenant.id,
    course.id,
    data.members.map((member) => member.userId),
  );
  // Mentors see aliases only, whatever a learner agreed to share with the academy.
  const shown = manager
    ? rows
    : rows.map((row) => ({ ...row, displayName: null, contactEmail: null }));
  const joinLink = academyUrl(tenant, `/join/${cohort.joinCode}`);

  return (
    <div className="space-y-6">
      <Link
        href="/studio/cohorts"
        className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft aria-hidden size={16} /> Cohorts
      </Link>
      <header className="space-y-1">
        <p className="eyebrow">{localize(course.title, tenant.settings.default_locale)}</p>
        <h1 className="text-3xl font-semibold">{cohort.name}</h1>
        <p className="text-sm text-muted">
          {cohortDates(t, cohort.startsOn, cohort.endsOn)}
          {cohort.status === "closed" ? " · closed" : ""}
        </p>
      </header>
      {created === "1" && (
        <Notice tone="good" title="Cohort created">
          Share the join link below with the group, and add their mentors.
        </Notice>
      )}
      {course.status !== "published" && (
        <Notice tone="warning" title="The course is not published yet">
          The join link works once it is.
        </Notice>
      )}

      <section aria-labelledby="join-heading" className="card-flat space-y-2 p-5 sm:p-6">
        <h2 id="join-heading" className="flex items-center gap-2 text-lg font-semibold">
          <Link2 aria-hidden size={18} /> Join link
        </h2>
        <p className="text-sm text-muted">
          Learners who open it sign in, join the cohort and start the course.
        </p>
        <code className="block break-all rounded-control bg-subtle p-3 font-mono text-sm">
          {joinLink}
        </code>
      </section>

      <section aria-labelledby="learners-heading" className="space-y-3">
        <h2 id="learners-heading" className="text-lg font-semibold">
          {rows.length} {rows.length === 1 ? "learner" : "learners"}
        </h2>
        {rows.length === 0 ? (
          <EmptyState icon={Users} title="Nobody has joined yet" />
        ) : (
          <LearnersTable rows={shown} canReview caption={`Learners in ${cohort.name}`} />
        )}
        {manager && rows.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">
              Remove someone from the cohort
            </summary>
            <ul className="mt-2 space-y-1">
              {rows.map((row) => (
                <li key={row.userId}>
                  <form action={removeMemberAction} className="flex items-center gap-2">
                    <input type="hidden" name="cohortId" value={cohort.id} />
                    <input type="hidden" name="userId" value={row.userId} />
                    <span className="font-mono">{row.alias}</span>
                    <SubmitButton
                      className="btn btn-ghost btn-sm"
                      confirm={`Remove ${row.alias} from ${cohort.name}? They stay in the course.`}
                    >
                      <UserMinus aria-hidden size={16} /> Remove
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section aria-labelledby="mentors-heading" className="card-flat space-y-3 p-5 sm:p-6">
        <div>
          <h2 id="mentors-heading" className="text-lg font-semibold">
            Mentors
          </h2>
          <p className="text-sm text-muted">
            Mentors review this cohort’s work in the Studio and see nothing else. Learners never see
            their names.
          </p>
        </div>
        {data.mentors.length > 0 && (
          <ul className="divide-y divide-line">
            {data.mentors.map((mentor) => (
              <li key={mentor.userId} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{mentor.email}</span>
                {manager && (
                  <form action={removeMentorAction}>
                    <input type="hidden" name="cohortId" value={cohort.id} />
                    <input type="hidden" name="userId" value={mentor.userId} />
                    <SubmitButton className="btn btn-ghost btn-sm">Remove</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {manager && <AddMentorForm cohortId={cohort.id} />}
      </section>

      {manager && (
        <>
          <CohortForm
            cohortId={cohort.id}
            name={cohort.name}
            startsOn={cohort.startsOn}
            endsOn={cohort.endsOn}
            status={cohort.status}
          />
          <form action={deleteCohortAction}>
            <input type="hidden" name="cohortId" value={cohort.id} />
            <SubmitButton
              className="btn btn-danger btn-sm"
              confirm="Delete this cohort? Its learners stay in the course; the grouping and mentors go."
            >
              <Trash aria-hidden size={16} /> Delete cohort
            </SubmitButton>
          </form>
        </>
      )}
    </div>
  );
}
