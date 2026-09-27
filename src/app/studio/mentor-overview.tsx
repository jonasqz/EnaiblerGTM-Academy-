import { ClipboardCheck, UsersRound } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { localize } from "@/core/i18n/locales";
import { getDb } from "@/db/client";
import { reviewScopeOf, type Session } from "@/server/access";
import { listCohorts } from "@/server/cohorts";
import { listReviewQueue } from "@/server/studio/reviews";

const day = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

export function cohortDates(startsOn: string | null, endsOn: string | null): string {
  const format = (value: string) => day.format(new Date(`${value}T00:00:00Z`));
  if (startsOn && endsOn) return `${format(startsOn)} – ${format(endsOn)}`;
  if (startsOn) return `from ${format(startsOn)}`;
  if (endsOn) return `until ${format(endsOn)}`;
  return "no dates";
}

/** A mentor's Studio: the cohorts they mentor and the work waiting for them. */
export async function MentorOverview(props: { session: Session }) {
  const { tenant, viewer } = props.session;
  const [cohorts, queue] = await Promise.all([
    listCohorts(getDb(), tenant.id, viewer.userId),
    listReviewQueue(getDb(), tenant.id, reviewScopeOf(props.session)),
  ]);
  const locale = tenant.settings.default_locale;
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Studio"
        title="Your cohorts"
        description="You review the work of the learners in the cohorts you mentor. Learners appear under an alias."
      />
      <section aria-label="Totals" className="grid grid-cols-2 gap-3">
        <StatTile label="Cohorts" value={cohorts.length} />
        <StatTile label="Waiting for your review" value={queue.length} />
      </section>
      {queue.length > 0 && (
        <Link href="/studio/reviews" className="btn btn-primary">
          <ClipboardCheck aria-hidden size={18} /> Open the review queue
        </Link>
      )}
      {cohorts.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No cohorts yet"
          body="Once you mentor a cohort, it shows here."
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
                  {cohortDates(row.cohort.startsOn, row.cohort.endsOn)} · {row.learners}{" "}
                  {row.learners === 1 ? "learner" : "learners"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
