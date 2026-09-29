import { CalendarDays, Clapperboard, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { RegistrationForm } from "@/app/(academy)/webinars/[slug]/registration-form";
import { EmbedHeight } from "@/app/embed/embed-height";
import { Badge } from "@/components/ui/badge";
import { formLabels } from "@/components/webinars/form-fields";
import { seatsLine } from "@/components/webinars/landing";
import { LocalTime } from "@/components/webinars/local-time";
import { embedEntryContext, encodeEntryContext } from "@/core/entry/context";
import { isBot } from "@/core/shared/bots";
import { capacityState, seatsLeft } from "@/core/webinars/capacity";
import { registrationOpen, webinarPhase } from "@/core/webinars/phase";
import { reliveState } from "@/core/webinars/relive";
import { formatWebinarDate, formatWebinarTime } from "@/core/webinars/time";
import { getDb } from "@/db/client";
import { MAGIC_LINK_TTL_MINUTES } from "@/server/auth";
import { getTenant, getTranslator } from "@/server/request";
import { loadWebinarPage, recordWebinarView } from "@/server/webinars/public";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The registration widget for the academy's own website (webinar brief
 * §2.2, embeddable form), framed by public/embed.js with data-webinar. Like
 * the path picker it sets no cookie and knows no session: whoever registers
 * gets the magic link, and every link opens the academy in a new tab. Over
 * with a recording, it follows the page: a public recording is one click
 * away there, any other is what registering gets you.
 */
export default async function EmbedWebinarPage({
  params,
  searchParams,
}: PageProps<"/embed/webinars/[slug]">) {
  const { slug } = await params;
  const tenant = await getTenant();
  const t = await getTranslator();
  const page = await loadWebinarPage(getDb(), tenant.id, slug, { drafts: false });
  if (!page) notFound();
  const { webinar } = page;
  const now = new Date();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") query.set(key, value);
  }
  const entry = embedEntryContext(query, { tenantLocales: tenant.settings.locales }, "webinar");
  // The Studio's own preview of the widget is not a visitor.
  const preview = query.get("preview") === "1";
  if (webinar.status === "published" && !preview && !isBot((await headers()).get("user-agent"))) {
    await recordWebinarView(getDb(), tenant.id, webinar, {
      locale: t.locale,
      entry,
      embedded: true,
    });
  }
  const relive = reliveState(webinar, page.recording, now);
  const seats = seatsLine(t, {
    state: capacityState(webinar.capacity, page.taken),
    left: seatsLeft(webinar.capacity, page.taken),
  });
  const open = registrationOpen(webinar, now, relive);
  const phase = webinarPhase(webinar, now);
  const pageUrl = `/webinars/${webinar.slug}?${new URLSearchParams(
    Object.fromEntries(
      Object.entries(entry.utm ?? {}).map(([key, value]) => [`utm_${key}`, value]),
    ),
  )}`;
  const form = (
    <RegistrationForm
      slug={webinar.slug}
      form={webinar.form}
      labels={formLabels(t, {
        academy: tenant.settings.author_display_name,
        title: webinar.title,
        recorded: webinar.recorded,
        recordingNotice: webinar.recordingNotice,
        email: null,
        linkMinutes: MAGIC_LINK_TTL_MINUTES,
        forRecording: relive !== "none",
      })}
      contentLocale={webinar.locale}
      signedIn={false}
      waitlist={relive === "none" && capacityState(webinar.capacity, page.taken) === "full"}
      ctx={encodeEntryContext(entry)}
      privacyUrl={tenant.settings.legal_links.privacy}
      embedded
    />
  );

  return (
    <main id="embed-root" className="space-y-4 p-4 sm:p-5">
      <div className="space-y-2">
        <h1 lang={webinar.locale} className="font-display text-2xl leading-tight">
          {webinar.title}
        </h1>
        {relive !== "none" ? (
          // A recording, like the page says: the day it was held, never a time to be there.
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="info" icon={Clapperboard}>
              {t.t("webinar.recordingBadge")}
            </Badge>
            <time dateTime={webinar.startsAt.toISOString()}>
              {t.t("webinar.recordedOn", {
                date: formatWebinarDate(webinar.startsAt, webinar.timeZone, t.locale),
              })}
            </time>
          </p>
        ) : (
          <p className="flex items-start gap-2 text-sm">
            <CalendarDays aria-hidden size={16} className="mt-0.5 shrink-0" />
            <span>
              <time dateTime={webinar.startsAt.toISOString()} className="block font-semibold">
                {formatWebinarTime(
                  webinar.startsAt,
                  webinar.durationMinutes,
                  webinar.timeZone,
                  t.locale,
                )}
              </time>
              <LocalTime
                startsAt={webinar.startsAt.toISOString()}
                durationMinutes={webinar.durationMinutes}
                timeZone={webinar.timeZone}
                locale={t.locale}
                label={t.t("webinar.yourTime", { time: "{time}" })}
              />
            </span>
          </p>
        )}
        {open && relive === "none" && seats && <Badge tone="info">{seats}</Badge>}
      </div>
      {webinar.status === "cancelled" ? (
        <p className="font-semibold">{t.t("webinar.cancelledTitle")}</p>
      ) : relive === "ready" && page.recording?.access === "public" ? (
        // Anyone may watch: on the academy's page, where the player is.
        <a
          href={`${pageUrl}#recording`}
          target="_blank"
          rel="noopener"
          className="btn btn-primary w-full"
        >
          <Clapperboard aria-hidden size={18} /> {t.t("webinar.embed.watch")}
          <span className="sr-only">{t.t("embed.newTab")}</span>
        </a>
      ) : relive !== "none" ? (
        <div className="space-y-3">
          <p>
            {t.t(relive === "ready" ? "webinar.relive.register" : "webinar.relive.registerComing")}
          </p>
          {form}
        </div>
      ) : phase === "ended" ? (
        <p className="font-semibold">{t.t("webinar.endedTitle")}</p>
      ) : open ? (
        form
      ) : (
        <p>{t.t("webinar.registrationClosed")}</p>
      )}
      <p className="text-sm">
        <a
          href={pageUrl}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 underline"
        >
          {t.t("webinar.embed.more")} <ExternalLink aria-hidden size={14} />
          <span className="sr-only">{t.t("embed.newTab")}</span>
        </a>
      </p>
      <EmbedHeight targetId="embed-root" />
    </main>
  );
}
