import { ClipboardCheck, UsersRound } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { localize } from "@/core/i18n/locales";
import { cohortDates } from "@/core/i18n/studio/helpers";
import { getDb } from "@/db/client";
import { reviewScopeOf, type Session } from "@/server/access";
import { listCohorts } from "@/server/cohorts";
import { listReviewQueue } from "@/server/studio/reviews";
import { getStudioText } from "@/server/studio-text";

/** A mentor's Studio: the cohorts they mentor and the work waiting for them. */
export async function MentorOverview(props: { session: Session }) {
  const { tenant, viewer } = props.session;
  const t = await getStudioText();
  const [cohorts, queue] = await Promise.all([
    listCohorts(getDb(), tenant.id, viewer.userId),
    listReviewQueue(getDb(), tenant.id, reviewScopeOf(props.session)),
  ]);
  const locale = tenant.settings.default_locale;
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t.t("common.studio")}
        title={t.t("overview.mentor.title")}
        description={t.t("overview.mentor.description")}
      />
      <section aria-label={t.t("overview.totals")} className="grid grid-cols-2 gap-3">
        <StatTile label={t.t("overview.mentor.cohorts")} value={cohorts.length} />
        <StatTile label={t.t("overview.mentor.waiting")} value={queue.length} />
      </section>
      {queue.length > 0 && (
        <Link href="/studio/reviews" className="btn btn-primary">
          <ClipboardCheck aria-hidden size={18} /> {t.t("overview.mentor.openQueue")}
        </Link>
      )}
      {cohorts.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={t.t("overview.mentor.empty")}
          body={t.t("overview.mentor.emptyBody")}
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {cohorts.map((row) => (
            <li key={row.cohort.id}>
              <Link
                href={`/studio/cohorts/${row.cohort.id}`}
                className="card card-interactive block space-y-1 p-5"
              >
                <span className="eyebrow">{localize(row.courseTitle, locale)}</span>
                <span className="block text-lg font-semibold">{row.cohort.name}</span>
                <span className="block text-sm text-muted">
                  {cohortDates(t, row.cohort.startsOn, row.cohort.endsOn)} ·{" "}
                  {t.n("common.learner", row.learners)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
