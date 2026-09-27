import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Hammer,
  ListChecks,
  PencilLine,
  Plus,
  Rocket,
  Target,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { CourseStatusBadge } from "@/components/studio/status-badges";
import { EmptyState } from "@/components/ui/empty-state";
import { Funnel } from "@/components/ui/funnel";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { can } from "@/core/access/roles";
import type { FUNNEL_STEPS } from "@/core/events/names";
import { localize } from "@/core/i18n/locales";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { listCourses } from "@/server/studio/courses";
import { studioOverview } from "@/server/studio/insights";
import { listReviewQueue } from "@/server/studio/reviews";

const FUNNEL_LABELS: Record<(typeof FUNNEL_STEPS)[number]["key"], string> = {
  entry: "Sign-ups started",
  start: "Courses started",
  submit: "Work submitted",
  pass: "Passed review",
  public: "Made public",
  shared: "Shared on LinkedIn",
  verification_views: "Verification views",
  cta_clicks: "CTA clicks",
};

const FLOW_STEPS = [
  { icon: Target, title: "Outcome", body: "Name what learners build and describe a good result." },
  { icon: ListChecks, title: "Rubric", body: "Criteria and levels the review scores against." },
  { icon: BookOpen, title: "Lessons", body: "Each lesson teaches one or more criteria." },
  { icon: Rocket, title: "Publish", body: "The checklist blocks gaps and risky wording." },
] as const;

export default async function StudioOverviewPage() {
  const { tenant, roles } = await requireCapability("studio.view");
  const db = getDb();
  const overview = await studioOverview(db, tenant.id);
  const courses = await listCourses(db, tenant.id);
  const queue = can(roles, "reviews.decide") ? await listReviewQueue(db, tenant.id) : [];
  const toDecide = queue.filter((row) => row.kind === "decide").length;
  const spotChecks = queue.length - toDecide;
  const canEdit = can(roles, "courses.edit");
  const fallback = [tenant.settings.default_locale];

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Studio"
        title="Overview"
        description={`How ${tenant.settings.author_display_name} is doing. Totals are all-time; the funnel covers the last 30 days.`}
        actions={
          canEdit && (
            <Link href="/studio/courses/new" className="btn btn-primary">
              <Plus aria-hidden size={18} /> New course
            </Link>
          )
        }
      />

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Learners" value={overview.learners} />
        <StatTile label="Course starts" value={overview.enrollments} />
        <StatTile label="Courses completed" value={overview.completions} />
        <StatTile
          label="Certificates of Completion"
          value={overview.credentials}
          hint={`${overview.publicCredentials} made public by learners`}
        />
      </section>

      {(toDecide > 0 || spotChecks > 0 || overview.draftCourses > 0) && (
        <section aria-labelledby="attention-heading" className="space-y-3">
          <h2 id="attention-heading" className="text-lg font-semibold">
            Needs attention
          </h2>
          <ul className="grid gap-3 md:grid-cols-3">
            {toDecide > 0 && (
              <AttentionCard
                href="/studio/reviews"
                icon={<ClipboardCheck aria-hidden size={20} />}
                title={`${toDecide} ${toDecide === 1 ? "result waits" : "results wait"} for a human`}
                body="Learners see nothing until you decide."
              />
            )}
            {spotChecks > 0 && (
              <AttentionCard
                href="/studio/reviews"
                icon={<ListChecks aria-hidden size={20} />}
                title={`${spotChecks} spot ${spotChecks === 1 ? "check" : "checks"}`}
                body="Released AI results sampled for a second look."
              />
            )}
            {overview.draftCourses > 0 && (
              <AttentionCard
                href="/studio/courses?status=draft"
                icon={<PencilLine aria-hidden size={20} />}
                title={`${overview.draftCourses} draft ${overview.draftCourses === 1 ? "course" : "courses"}`}
                body="Not visible to learners until published."
              />
            )}
          </ul>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="funnel-heading" className="card-flat space-y-5 p-5">
          <div>
            <h2 id="funnel-heading" className="text-lg font-semibold">
              Funnel
            </h2>
            <p className="text-sm text-muted">
              Events in the last 30 days, with the share of the step before.
            </p>
          </div>
          <Funnel
            caption="Funnel, last 30 days"
            rows={overview.funnel.map((step) => ({
              label: FUNNEL_LABELS[step.key],
              count: step.count,
            }))}
          />
        </section>

        <section aria-labelledby="courses-heading" className="card-flat space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="courses-heading" className="text-lg font-semibold">
              Courses
            </h2>
            <Link
              href="/studio/courses"
              className="inline-flex items-center gap-1 text-sm font-semibold hover:underline"
            >
              All courses <ArrowRight aria-hidden size={16} />
            </Link>
          </div>
          {courses.length === 0 ? (
            <EmptyState
              icon={Hammer}
              title="No courses yet"
              body="Every course starts from what learners build."
              action={
                canEdit && (
                  <Link href="/studio/courses/new" className="btn btn-primary btn-sm">
                    Create the first course
                  </Link>
                )
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {courses.slice(0, 6).map((course) => (
                <li key={course.id}>
                  <Link
                    href={`/studio/courses/${course.id}`}
                    className="-mx-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-control px-2 py-3 hover:bg-subtle"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {localize(course.title, fallback[0]!, fallback)}
                      </span>
                      <span className="text-sm text-muted">
                        {course.enrolled} started · {course.completed} completed
                        {course.pendingReviews > 0 && ` · ${course.pendingReviews} in review`}
                      </span>
                    </span>
                    <CourseStatusBadge status={course.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {canEdit && (
        <section aria-labelledby="flow-heading" className="space-y-4">
          <h2 id="flow-heading" className="text-lg font-semibold">
            How a course gets made
          </h2>
          <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {FLOW_STEPS.map((step, index) => (
              <li key={step.title} className="card-flat flex gap-3 p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-control bg-primary-soft">
                  <step.icon aria-hidden size={18} />
                </span>
                <span>
                  <span className="block font-semibold">
                    {index + 1}. {step.title}
                  </span>
                  <span className="text-sm text-muted">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function AttentionCard(props: { href: Route; icon: ReactNode; title: string; body: string }) {
  return (
    <li>
      <Link href={props.href} className="card card-interactive flex h-full gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-control bg-primary-soft">
          {props.icon}
        </span>
        <span>
          <span className="block font-semibold">{props.title}</span>
          <span className="text-sm text-muted">{props.body}</span>
        </span>
      </Link>
    </li>
  );
}
