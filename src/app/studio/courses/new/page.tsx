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

const STEPS: Array<{
  key: "outcome" | "rubric" | "lessons" | "details" | "publish";
  current?: boolean;
}> = [
  { key: "outcome", current: true },
  { key: "rubric" },
  { key: "lessons" },
  { key: "details" },
  { key: "publish" },
];

/** Outcome-first (brief §7): a course starts from the artifact, not from lessons. */
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
        <NewCourseForm locales={tenant.settings.locales} artifactTerm={learner.term("artifact")} />
        <aside aria-label={t.t("courses.new.steps")} className="lg:pt-2">
          <ol className="space-y-4">
            {STEPS.map((step, index) => (
              <li key={step.key} className="flex gap-3">
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                    step.current ? "bg-primary text-on-primary" : "bg-subtle text-muted"
                  }`}
                  aria-hidden
                >
                  {index + 1}
                </span>
                <span>
                  <span
                    className={`block text-sm font-semibold ${step.current ? "" : "text-muted"}`}
                  >
                    {t.t(`courses.step.${step.key}`)}
                    {step.current && (
                      <span className="sr-only"> {t.t("courses.new.thisStep")}</span>
                    )}
                  </span>
                  <span className="text-sm text-muted">{t.t(`courses.new.step.${step.key}`)}</span>
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
