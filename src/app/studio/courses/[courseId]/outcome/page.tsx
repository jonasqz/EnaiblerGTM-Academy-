import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OutcomeForm } from "@/app/studio/courses/[courseId]/outcome/outcome-form";
import { Notice } from "@/components/ui/notice";
import { isLocale } from "@/core/i18n/locales";
import { rubricSchema } from "@/core/review/rubric";
import { requireCapability } from "@/server/access";
import { getCourseEditor } from "@/server/studio/course-context";
import { getTranslator } from "@/server/request";

export const metadata: Metadata = { title: "Outcome and rubric" };

export default async function OutcomePage({
  params,
  searchParams,
}: PageProps<"/studio/courses/[courseId]/outcome">) {
  const { courseId } = await params;
  const { created } = await searchParams;
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/outcome`);
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor?.assignment || !editor.rubric) notFound();
  const t = await getTranslator();
  const { assignment } = editor;
  const file = assignment.submissionTypes.find((type) => type.type === "file");
  const form = assignment.submissionTypes.find((type) => type.type === "template_form");

  return (
    <div className="space-y-6">
      {created === "1" && (
        <Notice tone="good" title="Course created as a draft">
          It starts with a generic rubric. Make the criteria specific to your artifact, then add
          lessons that teach them.
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
        artifactTerm={t.term("artifact")}
      />
    </div>
  );
}
