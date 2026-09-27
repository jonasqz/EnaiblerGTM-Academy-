import { Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LearnersTable } from "@/components/studio/learners-table";
import { EmptyState } from "@/components/ui/empty-state";
import { can } from "@/core/access/roles";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { getCourseEditor } from "@/server/studio/course-context";
import { courseLearners } from "@/server/studio/insights";

export const metadata: Metadata = { title: "Learners" };

/** Everyone who started this course, where they are, and what they handed in. */
export default async function CourseLearnersPage({
  params,
}: PageProps<"/studio/courses/[courseId]/learners">) {
  const { courseId } = await params;
  const { tenant, roles } = await requireCapability(
    "people.view",
    `/studio/courses/${courseId}/learners`,
  );
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor) notFound();
  const rows = await courseLearners(getDb(), tenant.id, courseId);
  const canReview = can(roles, "reviews.decide");
  const completed = rows.filter((row) => row.completedAt).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {rows.length} {rows.length === 1 ? "learner" : "learners"} · {completed} completed
          </h2>
          <p className="max-w-2xl text-sm text-muted">
            Learners appear under an alias. Names and e-mail addresses only show for learners who
            agreed to be contacted by the academy.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Users} title="Nobody has started this course yet" />
      ) : (
        <LearnersTable rows={rows} canReview={canReview} caption="Learners of this course" />
      )}
    </div>
  );
}
