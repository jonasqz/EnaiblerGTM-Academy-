import { Bot, ClipboardCheck, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { auditText, holdReasonText, timeAgo } from "@/core/i18n/studio/helpers";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { localize } from "@/core/i18n/locales";
import { getDb } from "@/db/client";
import { getStudioText } from "@/server/studio-text";
import { requireCapability, reviewScopeOf } from "@/server/access";
import { listReviewQueue, type QueueRow } from "@/server/studio/reviews";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("team.reviews.title") };
}

/** Review queue (brief §8): results waiting for a human first, then spot checks of released ones. */
export default async function ReviewsPage({ searchParams }: PageProps<"/studio/reviews">) {
  const { decided } = await searchParams;
  const session = await requireCapability("reviews.decide", "/studio/reviews");
  const t = await getStudioText();
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
                <span className="font-mono font-semibold text-ink">{row.alias}</span> ·{" "}
                {t.t("common.learners.attempt", { n: row.attemptNo })} ·{" "}
                {t.t("team.reviews.handedIn", { when: timeAgo(t, row.submittedAt) })}
              </span>
              <span className="flex flex-wrap gap-1.5 pt-1">
                {row.kind === "spot_check" && row.ai?.audit && (
                  <Badge tone="info">{auditText(t, row.ai.audit)}</Badge>
                )}
                {row.ai?.reasons.map((reason) => (
                  <Badge key={reason} tone="warning">
                    {holdReasonText(t, reason)}
                  </Badge>
                ))}
                {!row.ai && <Badge>{t.t("team.reviews.noAi")}</Badge>}
                {row.holdReasons.map((reason) => (
                  <Badge key={reason} tone="warning">
                    {holdReasonText(t, reason)}
                  </Badge>
                ))}
              </span>
            </span>
            <span className="flex items-center gap-4">
              {row.ai && (
                <span className="text-right text-sm">
                  <span className="inline-flex items-center gap-1 text-muted">
                    <Bot aria-hidden size={14} /> {t.t("team.reviews.ai")}
                  </span>
                  <span className="block font-semibold tabular-nums">
                    {row.ai.percent} % ·{" "}
                    {row.ai.pass ? t.t("team.reviews.pass") : t.t("team.reviews.revise")}
                  </span>
                </span>
              )}
              <span className="btn btn-primary btn-sm">
                {row.kind === "decide" ? t.t("team.reviews.decide") : t.t("team.reviews.check")}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-8">
      <PageHeader title={t.t("team.reviews.title")} description={t.t("team.reviews.description")} />
      {decided && (
        <Notice
          tone="good"
          title={
            decided === "pass" ? t.t("team.reviews.savedPass") : t.t("team.reviews.savedRevise")
          }
        >
          {t.t("team.reviews.savedBody")}
        </Notice>
      )}

      <section aria-labelledby="decide-heading" className="space-y-3">
        <h2 id="decide-heading" className="flex items-center gap-2 text-lg font-semibold">
          <ClipboardCheck aria-hidden size={20} /> {t.t("team.reviews.waiting")}
          <span className="text-muted">{decide.length}</span>
        </h2>
        {decide.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title={t.t("team.reviews.waitingEmpty")}
            body={t.t("team.reviews.waitingEmptyBody")}
          />
        ) : (
          list(decide)
        )}
      </section>

      <section aria-labelledby="spot-heading" className="space-y-3">
        <h2 id="spot-heading" className="flex items-center gap-2 text-lg font-semibold">
          <ListChecks aria-hidden size={20} /> {t.t("team.reviews.spotChecks")}
          <span className="text-muted">{spotChecks.length}</span>
        </h2>
        <p className="text-sm text-muted">{t.t("team.reviews.spotChecksBody")}</p>
        {spotChecks.length > 0 && list(spotChecks)}
      </section>
    </div>
  );
}
