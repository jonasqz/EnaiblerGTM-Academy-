import {
  ArrowRight,
  BookOpen,
  Circle,
  CircleCheck,
  ClipboardCheck,
  Hammer,
  ListChecks,
  PencilLine,
  Plus,
  RefreshCw,
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
import { hasLegalPages } from "@/core/courses/publish-check";
import { localize } from "@/core/i18n/locales";
import { sameJson } from "@/core/shared/json";
import { DEFAULT_THEME } from "@/core/theme/enaibler-tokens";
import { getDb } from "@/db/client";
import { MentorOverview } from "@/app/studio/mentor-overview";
import { requireCapability } from "@/server/access";
import { listCourses } from "@/server/studio/courses";
import { studioOverview } from "@/server/studio/insights";
import { listReviewQueue } from "@/server/studio/reviews";
import { getStudioText } from "@/server/studio-text";

const FLOW_STEPS = [
  { icon: Target, key: "outcome" },
  { icon: ListChecks, key: "rubric" },
  { icon: BookOpen, key: "lessons" },
  { icon: Rocket, key: "publish" },
] as const;

export default async function StudioOverviewPage() {
  const session = await requireCapability("studio.view");
  const { tenant, roles } = session;
  const db = getDb();
  const t = await getStudioText();
  // Mentors work in their cohorts: their overview is their review queue and cohorts.
  if (!can(roles, "courses.view")) return <MentorOverview session={session} />;
  const overview = await studioOverview(db, tenant.id);
  const courses = await listCourses(db, tenant.id);
  const queue = can(roles, "reviews.decide") ? await listReviewQueue(db, tenant.id) : [];
  const toDecide = queue.filter((row) => row.kind === "decide").length;
  const spotChecks = queue.length - toDecide;
  const canEdit = can(roles, "courses.edit");
  const fallback = [tenant.settings.default_locale];
  // First steps of a new academy, until each one is done.
  const setup = can(roles, "academy.manage")
    ? [
        {
          done: !sameJson(tenant.theme, DEFAULT_THEME),
          title: t.t("overview.setup.brand.title"),
          body: t.t("overview.setup.brand.body"),
          href: "/studio/settings/brand",
        },
        {
          done: hasLegalPages(tenant.settings.legal_links),
          title: t.t("overview.setup.legal.title"),
          body: t.t("overview.setup.legal.body"),
          href: "/studio/settings",
        },
        {
          done: courses.length > 0,
          title: t.t("overview.setup.course.title"),
          body: t.t("overview.setup.course.body"),
          href: "/studio/courses/new",
        },
        {
          done: overview.publishedCourses > 0,
          title: t.t("overview.setup.publish.title"),
          body: t.t("overview.setup.publish.body"),
          href: "/studio/courses",
        },
      ]
    : [];
  const setupLeft = setup.filter((step) => !step.done).length;

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={t.t("common.studio")}
        title={t.t("overview.title")}
        description={t.t("overview.description", { academy: tenant.settings.author_display_name })}
        actions={
          canEdit && (
            <Link href="/studio/courses/new" className="btn btn-primary">
              <Plus aria-hidden size={18} /> {t.t("overview.newCourse")}
            </Link>
          )
        }
      />

      {setupLeft > 0 && (
        <section aria-labelledby="setup-heading" className="card space-y-4 p-5 sm:p-6">
          <div>
            <h2 id="setup-heading" className="text-lg font-semibold">
              {t.t("overview.setup.title")}
            </h2>
            <p className="text-sm text-muted">
              {t.t("overview.setup.progress", {
                done: setup.length - setupLeft,
                total: setup.length,
              })}
            </p>
          </div>
          <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {setup.map((step) => (
              <li key={step.title}>
                <Link
                  href={step.href as Route}
                  className="flex h-full gap-3 rounded-control border border-line p-3 hover:bg-subtle"
                >
                  {step.done ? (
                    <CircleCheck
                      role="img"
                      aria-label={t.t("overview.setup.done")}
                      size={20}
                      className="mt-0.5 shrink-0"
                      style={{ color: "var(--status-good)" }}
                    />
                  ) : (
                    <Circle
                      role="img"
                      aria-label={t.t("overview.setup.todo")}
                      size={20}
                      className="mt-0.5 shrink-0 text-muted"
                    />
                  )}
                  <span>
                    <span
                      className={`block font-semibold ${step.done ? "text-muted line-through" : ""}`}
                    >
                      {step.title}
                    </span>
                    <span className="text-sm text-muted">{step.body}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section
        aria-label={t.t("overview.totals")}
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <StatTile label={t.t("overview.stat.learners")} value={overview.learners} />
        <StatTile label={t.t("overview.stat.starts")} value={overview.enrollments} />
        <StatTile label={t.t("overview.stat.completed")} value={overview.completions} />
        <StatTile
          label={t.t("overview.stat.certificates")}
          value={overview.credentials}
          hint={t.t("overview.stat.public", { n: overview.publicCredentials })}
        />
      </section>

      {(toDecide > 0 ||
        spotChecks > 0 ||
        overview.draftCourses > 0 ||
        (canEdit && overview.flaggedLessons.count > 0)) && (
        <section aria-labelledby="attention-heading" className="space-y-3">
          <h2 id="attention-heading" className="text-lg font-semibold">
            {t.t("overview.attention")}
          </h2>
          <ul className="grid gap-3 md:grid-cols-3">
            {toDecide > 0 && (
              <AttentionCard
                href="/studio/reviews"
                icon={<ClipboardCheck aria-hidden size={20} />}
                title={t.n("overview.attention.decide", toDecide)}
                body={t.t("overview.attention.decideBody")}
              />
            )}
            {spotChecks > 0 && (
              <AttentionCard
                href="/studio/reviews"
                icon={<ListChecks aria-hidden size={20} />}
                title={t.n("overview.attention.spot", spotChecks)}
                body={t.t("overview.attention.spotBody")}
              />
            )}
            {canEdit && overview.flaggedLessons.count > 0 && (
              <AttentionCard
                href={
                  overview.flaggedLessons.courseId
                    ? `/studio/courses/${overview.flaggedLessons.courseId}/lessons`
                    : "/studio/courses"
                }
                icon={<RefreshCw aria-hidden size={20} />}
                title={t.n("overview.attention.flagged", overview.flaggedLessons.count)}
                body={t.n("overview.attention.flaggedBody", overview.flaggedLessons.count)}
              />
            )}
            {overview.draftCourses > 0 && (
              <AttentionCard
                href="/studio/courses?status=draft"
                icon={<PencilLine aria-hidden size={20} />}
                title={t.n("overview.attention.drafts", overview.draftCourses)}
                body={t.t("overview.attention.draftsBody")}
              />
            )}
          </ul>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="funnel-heading" className="card-flat space-y-5 p-5">
          <div>
            <h2 id="funnel-heading" className="text-lg font-semibold">
              {t.t("overview.funnel")}
            </h2>
            <p className="text-sm text-muted">{t.t("overview.funnelIntro")}</p>
          </div>
          <Funnel
            caption={t.t("overview.funnelCaption")}
            locale={t.locale}
            rateTitle={t.t("overview.funnelRate")}
            rows={overview.funnel.map((step) => ({
              label: t.t(`overview.funnel.${step.key}`),
              count: step.count,
            }))}
          />
        </section>

        <section aria-labelledby="courses-heading" className="card-flat space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="courses-heading" className="text-lg font-semibold">
              {t.t("overview.courses")}
            </h2>
            <Link
              href="/studio/courses"
              className="inline-flex items-center gap-1 text-sm font-semibold hover:underline"
            >
              {t.t("overview.allCourses")} <ArrowRight aria-hidden size={16} />
            </Link>
          </div>
          {courses.length === 0 ? (
            <EmptyState
              icon={Hammer}
              title={t.t("overview.noCourses")}
              body={t.t("overview.noCoursesBody")}
              action={
                canEdit && (
                  <Link href="/studio/courses/new" className="btn btn-primary btn-sm">
                    {t.t("overview.firstCourse")}
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
                        {t.t("overview.courseStats", {
                          started: course.enrolled,
                          completed: course.completed,
                        })}
                        {course.pendingReviews > 0 &&
                          ` · ${t.t("overview.courseInReview", { n: course.pendingReviews })}`}
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
            {t.t("overview.flow.title")}
          </h2>
          <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {FLOW_STEPS.map((step, index) => (
              <li key={step.key} className="card-flat flex gap-3 p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-control bg-primary-soft">
                  <step.icon aria-hidden size={18} />
                </span>
                <span>
                  <span className="block font-semibold">
                    {index + 1}. {t.t(`overview.flow.${step.key}.title`)}
                  </span>
                  <span className="text-sm text-muted">
                    {t.t(`overview.flow.${step.key}.body`)}
                  </span>
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
