import { ArrowLeft, ExternalLink, Eye } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseStatusBadge } from "@/components/studio/status-badges";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { can } from "@/core/access/roles";
import { localize } from "@/core/i18n/locales";
import { requireCapability } from "@/server/access";
import { getCourseEditor } from "@/server/studio/course-context";

/** Course editor shell: the build steps as tabs, in the order a course gets made. */
export default async function StudioCourseLayout({
  children,
  params,
}: LayoutProps<"/studio/courses/[courseId]">) {
  const { courseId } = await params;
  const { tenant, roles } = await requireCapability("studio.view", `/studio/courses/${courseId}`);
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor) notFound();
  const { course } = editor;
  const base = `/studio/courses/${course.id}`;
  const canEdit = can(roles, "courses.edit");
  const lessonCount = new Set(editor.lessons.map((lesson) => lesson.key)).size;
  const tabs: TabItem[] = [
    { href: base as Route, label: "Overview", exact: true },
    ...(canEdit
      ? [
          { href: `${base}/outcome` as Route, label: "Outcome & rubric" },
          { href: `${base}/sources` as Route, label: "Sources" },
          { href: `${base}/lessons` as Route, label: "Lessons", count: lessonCount },
          { href: `${base}/calibrate` as Route, label: "Calibrate" },
          { href: `${base}/details` as Route, label: "Details" },
          { href: `${base}/publish` as Route, label: "Publish" },
        ]
      : []),
    ...(can(roles, "people.view")
      ? [{ href: `${base}/learners` as Route, label: "Learners" }]
      : []),
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Link
          href="/studio/courses"
          className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
        >
          <ArrowLeft aria-hidden size={16} /> Courses
        </Link>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <h1 className="font-display text-2xl leading-tight sm:text-3xl">
              {localize(course.title, tenant.settings.default_locale)}
            </h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <CourseStatusBadge status={course.status} />
              <span>/{course.slug}</span>
              <span>{course.languages.map((language) => language.toUpperCase()).join(" · ")}</span>
              {course.version > 0 && <span>Published version {course.version}</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Link href={`${base}/preview` as Route} className="btn btn-secondary btn-sm">
                <Eye aria-hidden size={16} /> Preview as learner
              </Link>
            )}
            {course.status === "published" && (
              <Link href={`/courses/${course.slug}`} className="btn btn-ghost btn-sm">
                View live <ExternalLink aria-hidden size={14} />
              </Link>
            )}
          </div>
        </header>
        <Tabs items={tabs} label="Course" />
      </div>
      {children}
    </div>
  );
}
