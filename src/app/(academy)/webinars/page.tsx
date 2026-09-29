import { CalendarDays, Radio, Users, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { LocalTime } from "@/components/webinars/local-time";
import { seatsLine } from "@/components/webinars/landing";
import type { Translator } from "@/core/i18n/translator";
import { capacityState, seatsLeft } from "@/core/webinars/capacity";
import { webinarPhase } from "@/core/webinars/phase";
import { formatWebinarTime } from "@/core/webinars/time";
import { getDb } from "@/db/client";
import { getTenant, getTranslator } from "@/server/request";
import { listPublicWebinars, type WebinarListItem } from "@/server/webinars/public";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  const tenant = await getTenant();
  return {
    title: t.t("webinar.listTitle"),
    description: t.t("webinar.listIntro", { academy: tenant.settings.author_display_name }),
  };
}

function WebinarCard(props: { item: WebinarListItem; t: Translator; now: Date; past?: boolean }) {
  const { item, t } = props;
  const { webinar } = item;
  const live = !props.past && webinarPhase(webinar, props.now) === "live";
  const seats = props.past
    ? null
    : seatsLine(t, {
        state: capacityState(webinar.capacity, item.taken),
        left: seatsLeft(webinar.capacity, item.taken),
      });
  return (
    <Link
      href={`/webinars/${webinar.slug}`}
      className="card card-interactive flex h-full flex-col gap-3 p-5"
    >
      <span className="flex flex-wrap items-center gap-2">
        {live && (
          <Badge tone="critical" icon={Radio}>
            {t.t("webinar.live")}
          </Badge>
        )}
        <span className="text-sm font-semibold uppercase tracking-wide text-muted">
          {webinar.locale.toUpperCase()}
        </span>
      </span>
      <span
        lang={webinar.locale}
        className="font-display text-xl leading-snug [overflow-wrap:anywhere]"
      >
        {webinar.title}
      </span>
      <span className="mt-auto flex items-start gap-2 text-sm">
        <CalendarDays aria-hidden size={16} className="mt-0.5 shrink-0" />
        <span>
          <time dateTime={webinar.startsAt.toISOString()} className="block">
            {formatWebinarTime(
              webinar.startsAt,
              webinar.durationMinutes,
              webinar.timeZone,
              t.locale,
            )}
          </time>
          {!props.past && (
            <LocalTime
              startsAt={webinar.startsAt.toISOString()}
              durationMinutes={webinar.durationMinutes}
              timeZone={webinar.timeZone}
              locale={t.locale}
              label={t.t("webinar.yourTime", { time: "{time}" })}
            />
          )}
        </span>
      </span>
      {seats && (
        <span>
          <Badge tone="info" icon={Users}>
            {seats}
          </Badge>
        </span>
      )}
    </Link>
  );
}

/** The academy's webinars: what is coming (soonest first), then what has been. */
export default async function WebinarsPage() {
  const tenant = await getTenant();
  const t = await getTranslator();
  const now = new Date();
  const { upcoming, past } = await listPublicWebinars(getDb(), tenant.id, now);
  const academy = tenant.settings.author_display_name;
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={academy}
        title={t.t("webinar.listTitle")}
        description={t.t("webinar.listIntro", { academy })}
      />
      <section className="space-y-4" aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" className="font-display text-2xl">
          {t.t("webinar.upcoming")}
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState icon={Video} title={t.t("webinar.noneUpcoming")} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((item) => (
              <li key={item.webinar.id}>
                <WebinarCard item={item} t={t} now={now} />
              </li>
            ))}
          </ul>
        )}
      </section>
      {past.length > 0 && (
        <section className="space-y-4" aria-labelledby="past-heading">
          <h2 id="past-heading" className="font-display text-2xl">
            {t.t("webinar.past")}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((item) => (
              <li key={item.webinar.id}>
                <WebinarCard item={item} t={t} now={now} past />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
