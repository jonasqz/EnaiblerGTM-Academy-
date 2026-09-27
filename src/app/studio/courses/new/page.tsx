import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { NewCourseForm } from "@/app/studio/courses/new/new-course-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireCapability } from "@/server/access";
import { getTranslator } from "@/server/request";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("courses.newCourse") };
}

/**
 * Outcome-first (brief §7): a course starts from how learners finish it (the
 * artifact, a final test or both, §16), not from lessons.
 */
export default async function NewCoursePage() {
  const { tenant } = await requireCapability("courses.edit", "/studio/courses/new");
  const t = await getStudioText();
  // The artifact's name as learners see it (the academy's terms).
  const learner = await getTranslator();

  return (
    <div className="space-y-8">
      <Link
        href="/studio/courses"
        className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft aria-hidden size={16} /> {t.t("courses.list.title")}
      </Link>
      <PageHeader
        eyebrow={t.t("courses.newCourse")}
        title={t.t("courses.new.title")}
        description={t.t("courses.new.description")}
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <NewCourseForm
          locales={tenant.settings.locales}
          artifactTerm={learner.term("artifact")}
          aiReview={tenant.settings.features.ai_review}
        />
      </div>
    </div>
  );
}
