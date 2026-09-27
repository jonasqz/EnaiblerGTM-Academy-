import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { NewCourseForm } from "@/app/studio/courses/new/new-course-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireCapability } from "@/server/access";
import { getTranslator } from "@/server/request";

export const metadata: Metadata = { title: "New course" };

const STEPS = [
  { title: "Outcome", body: "What learners build and what good looks like.", current: true },
  { title: "Rubric", body: "A starter rubric is created for you to sharpen." },
  { title: "Lessons", body: "Written backwards from the rubric criteria." },
  { title: "Details", body: "Title, summary, duration in every language." },
  { title: "Publish", body: "Checklist, preview, then live." },
];

/** Outcome-first (brief §7): a course starts from the artifact, not from lessons. */
export default async function NewCoursePage() {
  const { tenant } = await requireCapability("courses.edit", "/studio/courses/new");
  const t = await getTranslator();

  return (
    <div className="space-y-8">
      <Link
        href="/studio/courses"
        className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft aria-hidden size={16} /> Courses
      </Link>
      <PageHeader
        eyebrow="New course"
        title="Start with the outcome"
        description="What will learners have built when they finish? Name it and describe a good result. The rubric and the lessons follow from there."
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <NewCourseForm locales={tenant.settings.locales} artifactTerm={t.term("artifact")} />
        <aside aria-label="Steps" className="lg:pt-2">
          <ol className="space-y-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3">
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
                    {step.title}
                    {step.current && <span className="sr-only"> (this step)</span>}
                  </span>
                  <span className="text-sm text-muted">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
