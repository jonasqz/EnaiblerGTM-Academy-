import { ArrowLeft } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InterviewForm } from "@/app/studio/courses/[courseId]/sources/interview/interview-form";
import { defaultQuestions } from "@/core/authoring/interview";
import { isLocale, localize } from "@/core/i18n/locales";
import { requireCapability } from "@/server/access";
import { getCourseEditor } from "@/server/studio/course-context";

export const metadata: Metadata = { title: "Expert interview" };

/** Expertise interview (brief §7, step 2): the author's own knowledge as a source. */
export default async function InterviewPage({
  params,
}: PageProps<"/studio/courses/[courseId]/sources/interview">) {
  const { courseId } = await params;
  const { tenant } = await requireCapability(
    "courses.edit",
    `/studio/courses/${courseId}/sources/interview`,
  );
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor) notFound();
  const languages = editor.course.languages.filter(isLocale);
  const locale = languages[0] ?? tenant.settings.default_locale;
  const artifact = localize(editor.assignment?.artifactName, locale, languages);

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href={`/studio/courses/${courseId}/sources` as Route}
        className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft aria-hidden size={16} /> All sources
      </Link>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Expert interview</h2>
        <p className="text-muted">
          Your experience is what makes the course yours. Answer in your own words; skip what does
          not apply. The answers become a source for the lesson drafts.
        </p>
      </div>
      <InterviewForm
        courseId={courseId}
        languages={languages}
        initial={defaultQuestions(locale, artifact)}
        aiAvailable={Boolean(process.env.LLM_BASE_URL?.trim())}
      />
    </div>
  );
}
