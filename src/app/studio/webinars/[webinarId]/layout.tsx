import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getStudioWebinar } from "@/app/studio/webinars/[webinarId]/load";
import { WebinarStatusBadge } from "@/app/studio/webinars/status";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { can } from "@/core/access/roles";
import { formatWebinarTime } from "@/core/webinars/time";
import { requireCapability } from "@/server/access";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata({
  params,
}: Pick<LayoutProps<"/studio/webinars/[webinarId]">, "params">): Promise<Metadata> {
  const { webinarId } = await params;
  const { tenant } = await requireCapability("studio.view", `/studio/webinars/${webinarId}`);
  const loaded = await getStudioWebinar(tenant.id, webinarId);
  return loaded ? { title: { default: loaded.webinar.title, template: "%s · Studio" } } : {};
}

/** A webinar in the Studio: set it up, build its page and form, see who registered. */
export default async function StudioWebinarLayout({
  children,
  params,
}: LayoutProps<"/studio/webinars/[webinarId]">) {
  const { webinarId } = await params;
  const { tenant, roles } = await requireCapability("studio.view", `/studio/webinars/${webinarId}`);
  if (!can(roles, "courses.edit") && !can(roles, "people.view")) notFound();
  const t = await getStudioText();
  const loaded = await getStudioWebinar(tenant.id, webinarId);
  if (!loaded) notFound();
  const { webinar, counts } = loaded;
  const base = `/studio/webinars/${webinar.id}`;
  const edit = can(roles, "courses.edit");
  const tabs: TabItem[] = [
    { href: base as Route, label: t.t("webinars.tab.overview"), exact: true },
    ...(edit
      ? [
          { href: `${base}/setup` as Route, label: t.t("webinars.tab.setup") },
          { href: `${base}/landing` as Route, label: t.t("webinars.tab.page") },
          { href: `${base}/form` as Route, label: t.t("webinars.tab.form") },
        ]
      : []),
    ...(can(roles, "people.view")
      ? [
          {
            href: `${base}/registrants` as Route,
            label: t.t("webinars.tab.registrants"),
            count: counts.registered + counts.waitlist,
          },
        ]
      : []),
  ];
  return (
    <div className="space-y-6">
      <Link href="/studio/webinars" className="inline-flex items-center gap-1 text-sm text-muted">
        <ArrowLeft aria-hidden size={16} /> {t.t("webinars.back")}
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="font-display text-2xl leading-tight [overflow-wrap:anywhere] sm:text-3xl">
            {webinar.title}
          </h1>
          <p className="text-sm text-muted">
            {formatWebinarTime(
              webinar.startsAt,
              webinar.durationMinutes,
              webinar.timeZone,
              t.locale,
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WebinarStatusBadge t={t} status={webinar.status} />
          <a
            href={`/webinars/${webinar.slug}`}
            target="_blank"
            rel="noopener"
            className="btn btn-secondary btn-sm"
          >
            {t.t("webinars.overview.openPage")} <ExternalLink aria-hidden size={14} />
          </a>
        </div>
      </header>
      <Tabs items={tabs} label={webinar.title} />
      {children}
    </div>
  );
}
