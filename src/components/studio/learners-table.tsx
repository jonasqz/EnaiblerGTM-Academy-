import { Globe, Lock } from "lucide-react";
import Link from "next/link";

import { LearnerName } from "@/components/studio/learner-name";
import { SubmissionStatusBadge } from "@/components/studio/status-badges";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { SubmissionStatus } from "@/core/review/outcome";
import type { CourseLearnerRow } from "@/server/studio/insights";

const dates = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

/** Learners of a course (or a cohort): where they are and what they handed in. */
export function LearnersTable(props: {
  rows: CourseLearnerRow[];
  canReview: boolean;
  caption: string;
}) {
  const { rows, canReview } = props;
  return (
    <div className="card-flat table-wrap">
      <table className="table">
        <caption className="sr-only">{props.caption}</caption>
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
                    <Link href={`/verify/${row.credential.publicId}`} className="hover:opacity-80">
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
  );
}
