import { BookOpen, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CourseStatusBadge } from "@/components/studio/status-badges";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/core/access/roles";
import { localize } from "@/core/i18n/locales";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { listCourses, type CourseStatus } from "@/server/studio/courses";

export const metadata: Metadata = { title: "Courses" };

const FILTERS: Array<{ status: CourseStatus | null; label: string }> = [
  { status: null, label: "All" },
  { status: "draft", label: "Drafts" },
  { status: "published", label: "Published" },
  { status: "unpublished", label: "Unpublished" },
];

const dates = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

/** Every course of the academy, drafts included, with what happens in each. */
export default async function StudioCoursesPage({ searchParams }: PageProps<"/studio/courses">) {
  const { tenant, roles } = await requireCapability("courses.view", "/studio/courses");
  const { status } = await searchParams;
  const all = await listCourses(getDb(), tenant.id);
  const active = FILTERS.find((filter) => filter.status === status) ?? FILTERS[0]!;
  const courses = active.status ? all.filter((course) => course.status === active.status) : all;
  const canEdit = can(roles, "courses.edit");
  const locale = tenant.settings.default_locale;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Courses"
        description="Every course of this academy, drafts included. Numbers are learners, not visits."
        actions={
          canEdit && (
            <Link href="/studio/courses/new" className="btn btn-primary">
              <Plus aria-hidden size={18} /> New course
            </Link>
          )
        }
      />

      <nav className="tabs" aria-label="Filter by status">
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
              {filter.label}
              <span className="ml-1.5 text-muted">{count}</span>
            </Link>
          );
        })}
      </nav>

      {courses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={all.length === 0 ? "No courses yet" : "No courses with this status"}
          body={
            all.length === 0
              ? "Start with what learners will build; lessons follow from the rubric."
              : undefined
          }
          action={
            canEdit &&
            all.length === 0 && (
              <Link href="/studio/courses/new" className="btn btn-primary btn-sm">
                Create the first course
              </Link>
            )
          }
        />
      ) : (
        <div className="card-flat table-wrap">
          <table className="table">
            <caption className="sr-only">Courses</caption>
            <thead>
              <tr>
                <th scope="col">Course</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">
                  Lessons
                </th>
                <th scope="col" className="num">
                  Started
                </th>
                <th scope="col" className="num">
                  Completed
                </th>
                <th scope="col" className="num">
                  In review
                </th>
                <th scope="col" className="num">
                  Certificates
                </th>
                <th scope="col">Updated</th>
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
                    {dates.format(course.updatedAt)}
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
