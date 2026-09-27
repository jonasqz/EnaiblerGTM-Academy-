"use client";

import { Globe, Lock } from "lucide-react";
import Link from "next/link";

import { LearnerName } from "@/components/studio/learner-name";
import { SubmissionStatusBadge } from "@/components/studio/status-badges";
import { useStudioText } from "@/components/studio/studio-text";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { SubmissionStatus } from "@/core/review/outcome";
import type { CourseLearnerRow } from "@/server/studio/insights";

/** Learners of a course (or a cohort): where they are and what they handed in. */
export function LearnersTable(props: {
  rows: CourseLearnerRow[];
  canReview: boolean;
  caption: string;
}) {
  const { rows, canReview } = props;
  const t = useStudioText();
  return (
    <div className="card-flat table-wrap">
      <table className="table">
        <caption className="sr-only">{props.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{t.t("common.learners.learner")}</th>
            <th scope="col">{t.t("common.learners.progress")}</th>
            <th scope="col">{t.t("common.learners.latestWork")}</th>
            <th scope="col">{t.t("common.learners.certificate")}</th>
            <th scope="col">{t.t("common.learners.started")}</th>
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
                    label={t.t("common.learners.progressLabel", {
                      alias: row.alias,
                      percent: row.progress.percent,
                    })}
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
                      {t.t("common.learners.attempt", { n: row.latestSubmission.attemptNo })}
                    </span>
                  </span>
                ) : (
                  <span className="text-sm text-muted">{t.t("common.learners.notHandedIn")}</span>
                )}
              </td>
              <td>
                {row.credential ? (
                  row.credential.visibility === "public" ? (
                    <Link href={`/verify/${row.credential.publicId}`} className="hover:opacity-80">
                      <Badge tone="good" icon={Globe}>
                        {t.t("common.learners.public")}
                      </Badge>
                    </Link>
                  ) : (
                    <Badge icon={Lock}>{t.t("common.learners.private")}</Badge>
                  )
                ) : (
                  <span className="text-sm text-muted">—</span>
                )}
              </td>
              <td className="whitespace-nowrap text-sm text-muted">{t.date(row.startedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
