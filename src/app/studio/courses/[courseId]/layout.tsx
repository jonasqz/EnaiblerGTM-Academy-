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
import { getStudioText } from "@/server/studio-text";

/** Course editor shell: the build steps as tabs, in the order a course gets made. */
export default async function StudioCourseLayout({
  children,
  params,
}: LayoutProps<"/studio/courses/[courseId]">) {
  const { courseId } = await params;
  const { tenant, roles } = await requireCapability("courses.view", `/studio/courses/${courseId}`);
  const t = await getStudioText();
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor) notFound();
  const { course } = editor;
  const base = `/studio/courses/${course.id}`;
  const canEdit = can(roles, "courses.edit");
  const lessonCount = new Set(editor.lessons.map((lesson) => lesson.key)).size;
  const tabs: TabItem[] = [
    { href: base as Route, label: t.t("courses.tab.overview"), exact: true },
    ...(canEdit
      ? [
          { href: `${base}/outcome` as Route, label: t.t("courses.tab.outcome") },
          { href: `${base}/sources` as Route, label: t.t("courses.tab.sources") },
          {
            href: `${base}/lessons` as Route,
            label: t.t("courses.step.lessons"),
            count: lessonCount,
          },
          { href: `${base}/calibrate` as Route, label: t.t("courses.tab.calibrate") },
          { href: `${base}/details` as Route, label: t.t("courses.step.details") },
          { href: `${base}/publish` as Route, label: t.t("courses.step.publish") },
        ]
      : []),
    ...(can(roles, "people.view")
      ? [{ href: `${base}/learners` as Route, label: t.t("courses.tab.learners") }]
      : []),
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Link
          href="/studio/courses"
          className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
        >
          <ArrowLeft aria-hidden size={16} /> {t.t("courses.list.title")}
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
              {course.version > 0 && (
                <span>{t.t("courses.header.version", { version: course.version })}</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Link href={`${base}/preview` as Route} className="btn btn-secondary btn-sm">
                <Eye aria-hidden size={16} /> {t.t("courses.previewAsLearner")}
              </Link>
            )}
            {course.status === "published" && (
              <Link href={`/courses/${course.slug}`} className="btn btn-ghost btn-sm">
                {t.t("courses.header.viewLive")} <ExternalLink aria-hidden size={14} />
              </Link>
            )}
          </div>
        </header>
        <Tabs items={tabs} label={t.t("courses.header.tabs")} />
      </div>
      {children}
    </div>
  );
}
