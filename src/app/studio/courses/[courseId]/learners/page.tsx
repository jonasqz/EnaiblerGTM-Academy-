import { Globe, Lock, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LearnerName } from "@/components/studio/learner-name";
import { SubmissionStatusBadge } from "@/components/studio/status-badges";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { can } from "@/core/access/roles";
import type { SubmissionStatus } from "@/core/review/outcome";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { getCourseEditor } from "@/server/studio/course-context";
import { courseLearners } from "@/server/studio/insights";

export const metadata: Metadata = { title: "Learners" };

const dates = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

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
        <div className="card-flat table-wrap">
          <table className="table">
            <caption className="sr-only">Learners of this course</caption>
            <thead>
              <tr>
                <th scope="col">Learner</th>
                <th scope="col">Progress</th>
                <th scope="col">Latest work</th>
                <th scope="col">Certificate</th>
                <th scope="col">Started</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId}>
                  <td>
                    <LearnerName
                      alias={row.alias}
                      displayName={row.displayName}
                      contactEmail={row.contactEmail}
                    />
                    <span className="block text-xs text-muted">{row.locale.toUpperCase()}</span>
                  </td>
                  <td className="min-w-40">
                    <div className="flex items-center gap-2">
                      <Progress
                        value={row.progress.percent}
                        label={`${row.alias}: ${row.progress.percent} % of lessons`}
                        className="w-24"
                      />
                      <span className="text-sm tabular-nums text-muted">
                        {row.progress.done}/{row.progress.total}
                      </span>
                    </div>
                  </td>
                  <td>
                    {row.latestSubmission ? (
                      <span className="flex flex-wrap items-center gap-2">
                        {canReview ? (
                          <Link
                            href={`/studio/reviews/${row.latestSubmission.id}`}
                            className="hover:opacity-80"
                          >
                            <SubmissionStatusBadge
                              status={row.latestSubmission.status as SubmissionStatus}
                            />
                          </Link>
                        ) : (
                          <SubmissionStatusBadge
                            status={row.latestSubmission.status as SubmissionStatus}
                          />
                        )}
                        <span className="text-xs text-muted">
                          attempt {row.latestSubmission.attemptNo}
                        </span>
                      </span>
                    ) : (
                      <span className="text-sm text-muted">Not handed in</span>
                    )}
                  </td>
                  <td>
                    {row.credential ? (
                      row.credential.visibility === "public" ? (
                        <Link
                          href={`/verify/${row.credential.publicId}`}
                          className="hover:opacity-80"
                        >
                          <Badge tone="good" icon={Globe}>
                            Public
                          </Badge>
                        </Link>
                      ) : (
                        <Badge icon={Lock}>Private</Badge>
                      )
                    ) : (
                      <span className="text-sm text-muted">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-sm text-muted">
                    {dates.format(row.startedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
