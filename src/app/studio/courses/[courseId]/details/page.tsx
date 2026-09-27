import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DetailsForm } from "@/app/studio/courses/[courseId]/details/details-form";
import { isLocale } from "@/core/i18n/locales";
import { requireCapability } from "@/server/access";
import { getCourseEditor } from "@/server/studio/course-context";
import { endingIssues } from "@/server/studio/courses";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("courses.step.details") };
}

export default async function DetailsPage({
  params,
}: PageProps<"/studio/courses/[courseId]/details">) {
  const { courseId } = await params;
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/details`);
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor) notFound();
  const { course } = editor;

  return (
    <div className="space-y-6">
      <DetailsForm
        courseId={course.id}
        academyLocales={tenant.settings.locales}
        languages={course.languages.filter(isLocale)}
        title={course.title}
        summary={course.summary}
        estMinutes={course.estMinutes}
        plannedLaunch={course.plannedLaunch}
        slug={course.slug}
        slugLocked={course.publishedAt !== null}
        deliveryMode={course.deliveryMode}
        completionMode={course.completionMode}
        published={course.publishedAt !== null}
        aiReview={tenant.settings.features.ai_review}
        live={course.status === "published"}
        ready={{
          work: endingIssues(editor, "work").length === 0,
          test: endingIssues(editor, "test").length === 0,
        }}
      />
    </div>
  );
}
