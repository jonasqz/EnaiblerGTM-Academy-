import { Hammer } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { setUpOutcomeAction } from "@/app/studio/courses/[courseId]/outcome/actions";
import { OutcomeForm } from "@/app/studio/courses/[courseId]/outcome/outcome-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { requiresWork } from "@/core/courses/completion";
import { isLocale } from "@/core/i18n/locales";
import { rubricSchema } from "@/core/review/rubric";
import { requireCapability } from "@/server/access";
import { getCourseEditor } from "@/server/studio/course-context";
import { getTranslator } from "@/server/request";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("authoring.outcome.title") };
}

export default async function OutcomePage({
  params,
  searchParams,
}: PageProps<"/studio/courses/[courseId]/outcome">) {
  const { courseId } = await params;
  const { created } = await searchParams;
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/outcome`);
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor) notFound();
  const t = await getStudioText();
  const work = requiresWork(editor.course.completionMode);
  if (!editor.assignment || !editor.rubric) {
    // Courses from a manifest start without an assignment; a test-only course may prepare one.
    return (
      <EmptyState
        icon={Hammer}
        title={t.t(work ? "authoring.outcome.missing.title" : "authoring.outcome.prepare.title")}
        body={t.t(work ? "authoring.outcome.missing.body" : "authoring.outcome.prepare.body")}
        action={
          <form action={setUpOutcomeAction}>
            <input type="hidden" name="courseId" value={editor.course.id} />
            <SubmitButton pendingLabel={t.t("common.adding")}>
              {t.t("authoring.outcome.missing.add")}
            </SubmitButton>
          </form>
        }
      />
    );
  }
  const learnerText = await getTranslator();
  const { assignment } = editor;
  const file = assignment.submissionTypes.find((type) => type.type === "file");
  const form = assignment.submissionTypes.find((type) => type.type === "template_form");

  return (
    <div className="space-y-6">
      {created === "1" && (
        <Notice tone="good" title={t.t("authoring.outcome.created.title")}>
          {t.t("authoring.outcome.created.body")}
        </Notice>
      )}
      {!work && (
        <Notice tone="warning" title={t.t("authoring.outcome.notUsed.title")}>
          {t.t("authoring.outcome.notUsed.body")}
        </Notice>
      )}
      <OutcomeForm
        courseId={editor.course.id}
        languages={editor.course.languages.filter(isLocale)}
        artifactName={assignment.artifactName}
        prompt={assignment.prompt}
        acceptText={file?.type === "file" && file.accept.includes("md")}
        acceptPdf={file?.type === "file" && file.accept.includes("pdf")}
        acceptImage={file?.type === "file" && file.accept.includes("image")}
        maxMb={file?.type === "file" ? file.max_mb : 15}
        acceptUrl={assignment.submissionTypes.some((type) => type.type === "url")}
        formSchema={form?.type === "template_form" ? JSON.stringify(form.schema, null, 2) : null}
        rubric={rubricSchema.parse(editor.rubric.definition)}
        artifactTerm={learnerText.term("artifact")}
        lessonCount={editor.lessons.length}
        aiAvailable={Boolean(process.env.LLM_BASE_URL?.trim())}
      />
    </div>
  );
}
