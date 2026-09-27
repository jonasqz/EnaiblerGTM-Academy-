import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TestEditor } from "@/app/studio/courses/[courseId]/test/test-editor";
import { Notice } from "@/components/ui/notice";
import { requiresTest } from "@/core/courses/completion";
import { isLocale } from "@/core/i18n/locales";
import { DEFAULT_PASS_PERCENT } from "@/core/questions/questions";
import { requireCapability } from "@/server/access";
import { getCourseEditor } from "@/server/studio/course-context";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("courses.tab.test") };
}

/** The final test (brief §16): questions in every course language, a pass mark, graded on hand-in. */
export default async function TestPage({
  params,
  searchParams,
}: PageProps<"/studio/courses/[courseId]/test">) {
  const { courseId } = await params;
  const { created } = await searchParams;
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/test`);
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor) notFound();
  const t = await getStudioText();
  const mode = editor.course.completionMode;
  // A course that never asked for a test has no row yet: the first save creates it.
  const test = editor.test;

  return (
    <div className="space-y-6">
      {created === "1" && (
        <Notice tone="good" title={t.t("courses.test.created.title")}>
          {t.t("courses.test.created.body")}
        </Notice>
      )}
      {!requiresTest(mode) && (
        <Notice tone="warning" title={t.t("courses.test.notUsed.title")}>
          {t.t("courses.test.notUsed.body")}
        </Notice>
      )}
      <section aria-labelledby="test-intro" className="card-flat max-w-3xl space-y-1 p-5 sm:p-6">
        <h2 id="test-intro" className="text-lg font-semibold">
          {t.t("courses.test.intro.title")}
        </h2>
        <p className="text-sm text-muted">
          {t.t("courses.test.intro.body")}
          {requiresTest(mode) &&
            ` ${t.t(mode === "work_and_test" ? "courses.test.intro.work_and_test" : "courses.test.intro.test")}`}
        </p>
      </section>
      <TestEditor
        courseId={editor.course.id}
        languages={editor.course.languages.filter(isLocale)}
        test={{
          questions: test?.questions ?? [],
          passPercent: test?.passPercent ?? DEFAULT_PASS_PERCENT,
          showMistakes: test?.showMistakes ?? true,
        }}
      />
    </div>
  );
}
