import { Radio, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { NewWebinarForm } from "@/app/studio/webinars/forms";
import { WebinarStatusBadge } from "@/app/studio/webinars/status";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/core/access/roles";
import { languageName } from "@/core/i18n/studio/helpers";
import type { StudioText } from "@/core/i18n/studio/translator";
import { webinarPhase } from "@/core/webinars/phase";
import { formatWebinarTime, timeZoneOptions, utcToZonedInput } from "@/core/webinars/time";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { getStudioText, studioTimeZone } from "@/server/studio-text";
import { listStudioWebinars, type StudioWebinarRow } from "@/server/webinars/studio";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("webinars.title") };
}

function Row(props: { row: StudioWebinarRow; t: StudioText; now: Date }) {
  const { row, t } = props;
  const live = row.status === "published" && webinarPhase(row, props.now) === "live";
  return (
    <li>
      <Link
        href={`/studio/webinars/${row.id}`}
        className="card card-interactive flex flex-wrap items-center gap-x-4 gap-y-2 p-4"
      >
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block font-semibold [overflow-wrap:anywhere]">{row.title}</span>
          <span className="block text-sm text-muted">
            {formatWebinarTime(row.startsAt, row.durationMinutes, row.timeZone, t.locale)} ·{" "}
            {languageName(t, row.locale)}
          </span>
          <span className="block text-sm text-muted">
            {t.t("webinars.counts", {
              registered: row.registered,
              waitlist: row.waitlist,
              attended: row.attended,
            })}
          </span>
        </span>
        {live ? (
          <Badge tone="critical" icon={Radio}>
            {t.t("webinars.phase.live")}
          </Badge>
        ) : (
          <WebinarStatusBadge t={t} status={row.status} />
        )}
      </Link>
    </li>
  );
}

/** Webinars (webinar brief §2.2): upcoming first, then those that took place. */
export default async function StudioWebinarsPage() {
  const { tenant, roles } = await requireCapability("studio.view", "/studio/webinars");
  if (!can(roles, "courses.edit") && !can(roles, "people.view")) notFound();
  const t = await getStudioText();
  const now = new Date();
  const rows = await listStudioWebinars(getDb(), tenant.id);
  const upcoming = rows.filter((row) => webinarPhase(row, now) !== "ended");
  const past = rows.filter((row) => webinarPhase(row, now) === "ended").reverse();
  const zone = studioTimeZone();
  const nextWeek = utcToZonedInput(new Date(now.getTime() + 7 * 24 * 60 * 60_000), zone);

  return (
    <div className="space-y-8">
      <PageHeader title={t.t("webinars.title")} description={t.t("webinars.description")} />
      {rows.length === 0 ? (
        <EmptyState icon={Video} title={t.t("webinars.empty")} body={t.t("webinars.emptyBody")} />
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="space-y-3" aria-labelledby="upcoming-heading">
              <h2 id="upcoming-heading" className="text-lg font-semibold">
                {t.t("webinars.upcoming")}
              </h2>
              <ul className="space-y-3">
                {upcoming.map((row) => (
                  <Row key={row.id} row={row} t={t} now={now} />
                ))}
              </ul>
            </section>
          )}
          {past.length > 0 && (
            <section className="space-y-3" aria-labelledby="past-heading">
              <h2 id="past-heading" className="text-lg font-semibold">
                {t.t("webinars.past")}
              </h2>
              <ul className="space-y-3">
                {past.map((row) => (
                  <Row key={row.id} row={row} t={t} now={now} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {can(roles, "courses.edit") && (
        <NewWebinarForm
          languages={tenant.settings.locales.map((code) => ({
            code,
            label: languageName(t, code),
          }))}
          timeZone={zone}
          timeZones={timeZoneOptions()}
          defaultDate={nextWeek.date}
        />
      )}
    </div>
  );
}
