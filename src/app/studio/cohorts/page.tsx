import { UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { NewCohortForm } from "@/app/studio/cohorts/forms";
import { cohortDates } from "@/core/i18n/studio/helpers";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/core/access/roles";
import { localize } from "@/core/i18n/locales";
import { getDb } from "@/db/client";
import { getStudioText } from "@/server/studio-text";
import { requireCapability } from "@/server/access";
import { listCohorts } from "@/server/cohorts";
import { listCourses } from "@/server/studio/courses";

export const metadata: Metadata = { title: "Cohorts" };

/** Groups that take a course together, with a join link and mentors (brief §4, phase 2). */
export default async function CohortsPage() {
  const { tenant, roles, viewer } = await requireCapability("studio.view", "/studio/cohorts");
  const t = await getStudioText();
  const manager = can(roles, "cohorts.manage");
  if (!manager && !roles.includes("mentor")) notFound();
  const locale = tenant.settings.default_locale;
  const [cohorts, courses] = await Promise.all([
    listCohorts(getDb(), tenant.id, manager ? undefined : viewer.userId),
    manager ? listCourses(getDb(), tenant.id) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Cohorts"
        description="Groups that start a course together: they join with a link, see their dates, and their mentors review their work."
      />
      {!tenant.settings.features.cohorts && (
        <Notice tone="info" title="Cohorts are switched off">
          Switch them on under Settings → Modules to show cohort dates to learners.
        </Notice>
      )}
      {cohorts.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No cohorts yet"
          body={
            manager ? "Create one for a course below." : "Once you mentor a cohort, it shows here."
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {cohorts.map((row) => (
            <li key={row.cohort.id}>
              <Link
                href={`/studio/cohorts/${row.cohort.id}`}
                className="card card-interactive block space-y-2 p-5"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="eyebrow">{localize(row.courseTitle, locale)}</span>
                  {row.cohort.status === "closed" && <Badge>Closed</Badge>}
                </span>
                <span className="block text-lg font-semibold">{row.cohort.name}</span>
                <span className="block text-sm text-muted">
                  {cohortDates(t, row.cohort.startsOn, row.cohort.endsOn)} · {row.learners}{" "}
                  {row.learners === 1 ? "learner" : "learners"} · {row.mentors}{" "}
                  {row.mentors === 1 ? "mentor" : "mentors"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {manager && courses.length > 0 && (
        <NewCohortForm
          courses={courses.map((course) => ({
            id: course.id,
            label: `${localize(course.title, locale)}${course.status === "published" ? "" : " (draft)"}`,
          }))}
        />
      )}
    </div>
  );
}
