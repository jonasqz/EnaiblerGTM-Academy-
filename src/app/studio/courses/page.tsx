import { BookOpen, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CourseStatusBadge } from "@/components/studio/status-badges";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/core/access/roles";
import { localize } from "@/core/i18n/locales";
import type { StudioKey } from "@/core/i18n/studio/index";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { listCourses, type CourseStatus } from "@/server/studio/courses";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("courses.list.title") };
}

const FILTERS: Array<{ status: CourseStatus | null; label: StudioKey }> = [
  { status: null, label: "courses.list.filter.all" },
  { status: "draft", label: "courses.list.filter.draft" },
  { status: "published", label: "courses.list.filter.published" },
  { status: "unpublished", label: "courses.list.filter.unpublished" },
];

/** Every course of the academy, drafts included, with what happens in each. */
export default async function StudioCoursesPage({ searchParams }: PageProps<"/studio/courses">) {
  const { tenant, roles } = await requireCapability("courses.view", "/studio/courses");
  const t = await getStudioText();
  const { status } = await searchParams;
  const all = await listCourses(getDb(), tenant.id);
  const active = FILTERS.find((filter) => filter.status === status) ?? FILTERS[0]!;
  const courses = active.status ? all.filter((course) => course.status === active.status) : all;
  const canEdit = can(roles, "courses.edit");
  const locale = tenant.settings.default_locale;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.t("courses.list.title")}
        description={t.t("courses.list.description")}
        actions={
          canEdit && (
            <Link href="/studio/courses/new" className="btn btn-primary">
              <Plus aria-hidden size={18} /> {t.t("courses.newCourse")}
            </Link>
          )
        }
      />

      <nav className="tabs" aria-label={t.t("courses.list.filterLabel")}>
        {FILTERS.map((filter) => {
          const count = filter.status
            ? all.filter((course) => course.status === filter.status).length
            : all.length;
          return (
            <Link
              key={filter.label}
              href={filter.status ? `/studio/courses?status=${filter.status}` : "/studio/courses"}
              aria-current={filter === active ? "page" : undefined}
            >
              {t.t(filter.label)}
              <span className="ml-1.5 text-muted">{count}</span>
            </Link>
          );
        })}
      </nav>

      {courses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={all.length === 0 ? t.t("courses.list.empty") : t.t("courses.list.emptyFiltered")}
          body={all.length === 0 ? t.t("courses.list.emptyBody") : undefined}
          action={
            canEdit &&
            all.length === 0 && (
              <Link href="/studio/courses/new" className="btn btn-primary btn-sm">
                {t.t("courses.list.firstCourse")}
              </Link>
            )
          }
        />
      ) : (
        <div className="card-flat table-wrap">
          <table className="table">
            <caption className="sr-only">{t.t("courses.list.title")}</caption>
            <thead>
              <tr>
                <th scope="col">{t.t("courses.list.course")}</th>
                <th scope="col">{t.t("courses.list.status")}</th>
                <th scope="col" className="num">
                  {t.t("courses.list.lessons")}
                </th>
                <th scope="col" className="num">
                  {t.t("courses.list.started")}
                </th>
                <th scope="col" className="num">
                  {t.t("courses.list.completed")}
                </th>
                <th scope="col" className="num">
                  {t.t("courses.list.inReview")}
                </th>
                <th scope="col" className="num">
                  {t.t("courses.list.certificates")}
                </th>
                <th scope="col">{t.t("courses.list.updated")}</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course.id}>
                  <td className="min-w-64">
                    <Link
                      href={`/studio/courses/${course.id}`}
                      className="font-semibold hover:underline"
                    >
                      {localize(course.title, locale)}
                    </Link>
                    <span className="block text-xs text-muted">
                      /{course.slug} ·{" "}
                      {course.languages.map((language) => language.toUpperCase()).join(" · ")}
                    </span>
                  </td>
                  <td>
                    <CourseStatusBadge status={course.status} />
                  </td>
                  <td className="num">{course.lessons}</td>
                  <td className="num">{course.enrolled}</td>
                  <td className="num">{course.completed}</td>
                  <td className="num">
                    {course.pendingReviews > 0 ? <strong>{course.pendingReviews}</strong> : 0}
                  </td>
                  <td className="num">{course.credentials}</td>
                  <td className="whitespace-nowrap text-sm text-muted">
                    {t.date(course.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
