import { ArrowRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import type { SharingSummary } from "@/core/analytics/sharing";
import type { StudioText } from "@/core/i18n/studio/translator";

interface NumberRow {
  label: string;
  value: number;
  detail?: string | null;
}

function Numbers(props: { t: StudioText; rows: NumberRow[] }) {
  return (
    <dl className="grid gap-3 text-sm">
      {props.rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-3">
          <dt className="min-w-0">
            <span className="text-muted">{row.label}</span>
            {row.detail && <span className="block text-xs text-muted">{row.detail}</span>}
          </dt>
          <dd className="font-semibold tabular-nums">{props.t.number(row.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

const sharedRow = (t: StudioText, summary: SharingSummary): NumberRow => ({
  label: t.t("overview.sharing.shared"),
  value: summary.shared.total,
  detail: summary.shared.total
    ? t.t("overview.sharing.sharedSplit", {
        posts: summary.shared.post,
        profiles: summary.shared.profile,
      })
    : null,
});

const viewsRow = (t: StudioText, summary: SharingSummary): NumberRow => ({
  label: t.t("overview.sharing.views"),
  value: summary.views.total,
  detail: summary.views.total
    ? t.t("overview.sharing.viewsSplit", {
        post: summary.views.post,
        profile: summary.views.profile,
        other: summary.views.other,
      })
    : null,
});

/**
 * What shared certificates brought the academy in the period (brief §14):
 * from issuing through sharing and visits to new learners and leads.
 */
export function SharingCard(props: {
  t: StudioText;
  summary: SharingSummary;
  leadsHref: Route | null;
  settingsHref: Route | null;
}) {
  const { t, summary } = props;
  return (
    <section aria-labelledby="sharing-heading" className="card-flat space-y-5 p-5">
      <div>
        <h3 id="sharing-heading" className="text-lg font-semibold">
          {t.t("overview.sharing.heading")}
        </h3>
        <p className="text-sm text-muted">{t.t("overview.sharing.intro")}</p>
      </div>
      <Numbers
        t={t}
        rows={[
          { label: t.t("overview.sharing.issued"), value: summary.issued },
          {
            label: t.t("overview.sharing.public"),
            value: summary.madePublic,
            detail:
              summary.shareRate === null
                ? null
                : t.t("overview.sharing.shareRate", { rate: summary.shareRate }),
          },
          sharedRow(t, summary),
          viewsRow(t, summary),
          {
            label: t.t("overview.sharing.clicks"),
            value: summary.clicks.total,
            detail:
              summary.clickRate === null
                ? null
                : t.t("overview.sharing.clickRate", { rate: summary.clickRate }),
          },
          {
            label: t.t("overview.sharing.newLearners"),
            value: summary.newLearners,
            detail: t.t("overview.sharing.newLearnersHint"),
          },
          {
            label: t.t("overview.sharing.newLeads"),
            value: summary.newLeads,
            detail: t.t("overview.sharing.newLeadsHint"),
          },
        ]}
      />
      {(props.leadsHref || props.settingsHref) && (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {props.leadsHref && (
            <Link
              href={props.leadsHref}
              className="inline-flex items-center gap-1 text-sm font-semibold hover:underline"
            >
              {t.t("overview.sharing.seeLeads")} <ArrowRight aria-hidden size={16} />
            </Link>
          )}
          {props.settingsHref && (
            <Link
              href={props.settingsHref}
              className="inline-flex items-center gap-1 text-sm font-semibold hover:underline"
            >
              {t.t("overview.sharing.settings")} <ArrowRight aria-hidden size={16} />
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

/** The same numbers for one course: shared, looked at, and who started through them. */
export function CourseSharingCard(props: { t: StudioText; summary: SharingSummary; days: number }) {
  const { t, summary } = props;
  return (
    <section aria-labelledby="course-sharing-heading" className="card-flat space-y-4 p-5">
      <div>
        <h2 id="course-sharing-heading" className="text-lg font-semibold">
          {t.t("overview.sharing.course.heading")}
        </h2>
        <p className="text-sm text-muted">
          {t.t("overview.sharing.course.intro", { days: props.days })}
        </p>
      </div>
      <Numbers
        t={t}
        rows={[
          sharedRow(t, summary),
          viewsRow(t, summary),
          {
            label: t.t("overview.sharing.course.starts"),
            value: summary.newLearners,
            detail: t.t("overview.sharing.course.startsHint"),
          },
        ]}
      />
    </section>
  );
}
