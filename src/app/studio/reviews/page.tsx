import { Bot, ClipboardCheck, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AUDIT_LABELS, HOLD_REASON_LABELS, timeAgo } from "@/components/studio/review-labels";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { localize } from "@/core/i18n/locales";
import { getDb } from "@/db/client";
import { requireCapability, reviewScopeOf } from "@/server/access";
import { listReviewQueue, type QueueRow } from "@/server/studio/reviews";

export const metadata: Metadata = { title: "Reviews" };

/** Review queue (brief §8): results waiting for a human first, then spot checks of released ones. */
export default async function ReviewsPage({ searchParams }: PageProps<"/studio/reviews">) {
  const { decided } = await searchParams;
  const session = await requireCapability("reviews.decide", "/studio/reviews");
  const { tenant } = session;
  const queue = await listReviewQueue(getDb(), tenant.id, reviewScopeOf(session));
  const decide = queue.filter((row) => row.kind === "decide");
  const spotChecks = queue.filter((row) => row.kind === "spot_check");
  const locale = tenant.settings.default_locale;

  const list = (rows: QueueRow[]) => (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.submissionId}>
          <Link
            href={`/studio/reviews/${row.submissionId}`}
            className="card card-interactive flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5"
          >
            <span className="min-w-0 space-y-1">
              <span className="block font-semibold">{localize(row.courseTitle, locale)}</span>
              <span className="block text-sm text-muted">
                <span className="font-mono font-semibold text-ink">{row.alias}</span> · attempt{" "}
                {row.attemptNo} · handed in {timeAgo(row.submittedAt)}
              </span>
              <span className="flex flex-wrap gap-1.5 pt-1">
                {row.kind === "spot_check" && row.ai?.audit && (
                  <Badge tone="info">{AUDIT_LABELS[row.ai.audit] ?? row.ai.audit}</Badge>
                )}
                {row.ai?.reasons.map((reason) => (
                  <Badge key={reason} tone="warning">
                    {HOLD_REASON_LABELS[reason] ?? reason}
                  </Badge>
                ))}
                {!row.ai && <Badge>No AI review</Badge>}
              </span>
            </span>
            <span className="flex items-center gap-4">
              {row.ai && (
                <span className="text-right text-sm">
                  <span className="inline-flex items-center gap-1 text-muted">
                    <Bot aria-hidden size={14} /> AI
                  </span>
                  <span className="block font-semibold tabular-nums">
                    {row.ai.percent} % · {row.ai.pass ? "pass" : "revise"}
                  </span>
                </span>
              )}
              <span className="btn btn-primary btn-sm">
                {row.kind === "decide" ? "Decide" : "Check"}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Reviews"
        description="Results the AI may not release on its own wait here. Every decision is recorded next to the AI review; a changed verdict needs a reason."
      />
      {decided && (
        <Notice
          tone="good"
          title={decided === "pass" ? "Decision saved: passed" : "Decision saved: needs revision"}
        >
          The learner sees your feedback now.
        </Notice>
      )}

      <section aria-labelledby="decide-heading" className="space-y-3">
        <h2 id="decide-heading" className="flex items-center gap-2 text-lg font-semibold">
          <ClipboardCheck aria-hidden size={20} /> Waiting for a decision
          <span className="text-muted">{decide.length}</span>
        </h2>
        {decide.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="Nothing waits for a decision"
            body="Learners get AI results right away unless the rubric's policy holds them."
          />
        ) : (
          list(decide)
        )}
      </section>

      <section aria-labelledby="spot-heading" className="space-y-3">
        <h2 id="spot-heading" className="flex items-center gap-2 text-lg font-semibold">
          <ListChecks aria-hidden size={20} /> Spot checks
          <span className="text-muted">{spotChecks.length}</span>
        </h2>
        <p className="text-sm text-muted">
          Already released to the learner. Your check trains the agreement rate; a different verdict
          overrides the AI.
        </p>
        {spotChecks.length > 0 && list(spotChecks)}
      </section>
    </div>
  );
}
