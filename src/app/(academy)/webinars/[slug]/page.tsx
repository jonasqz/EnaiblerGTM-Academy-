import { CalendarDays, CalendarPlus, CircleCheck, Clock, ExternalLink, Video } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { cancelRegistrationAction } from "@/app/(academy)/webinars/[slug]/actions";
import { CheckInForm } from "@/app/(academy)/webinars/[slug]/checkin-form";
import { RegistrationForm } from "@/app/(academy)/webinars/[slug]/registration-form";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormFieldsView, formLabels } from "@/components/webinars/form-fields";
import { WebinarLanding } from "@/components/webinars/landing";
import { landingView } from "@/components/webinars/view";
import { can } from "@/core/access/roles";
import {
  decodeEntryContext,
  encodeEntryContext,
  entryQuery,
  isEmptyEntryContext,
  parseEntryParams,
} from "@/core/entry/context";
import { localize } from "@/core/i18n/locales";
import type { Translator } from "@/core/i18n/translator";
import { isBot } from "@/core/shared/bots";
import {
  checkinOpen,
  joinLinkVisible,
  registrationOpen,
  webinarPhase,
  JOIN_OPENS_MINUTES,
} from "@/core/webinars/phase";
import { formatWebinarTime } from "@/core/webinars/time";
import { getDb } from "@/db/client";
import { getSession } from "@/server/access";
import { MAGIC_LINK_TTL_MINUTES } from "@/server/auth";
import { getTenant, getTranslator } from "@/server/request";
import {
  loadWebinarPage,
  recordWebinarView,
  viewerRegistration,
  type ViewerRegistration,
  type WebinarPage,
} from "@/server/webinars/public";
import { seriesOverview, type SeriesOverview } from "@/server/webinars/series";

async function load(slug: string) {
  const tenant = await getTenant();
  const session = await getSession();
  // The team previews drafts on the real page; nobody else finds them.
  const drafts = session !== null && can(session.roles, "courses.edit");
  return { tenant, session, page: await loadWebinarPage(getDb(), tenant.id, slug, { drafts }) };
}

export async function generateMetadata({
  params,
}: PageProps<"/webinars/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTranslator();
  const { page } = await load(slug);
  if (!page) return { title: t.t("webinar.listTitle"), robots: { index: false } };
  const { webinar } = page;
  const description = webinar.description.replace(/\s+/g, " ").slice(0, 200) || undefined;
  const image = { url: `/webinars/${webinar.slug}/image`, width: 1200, height: 630 };
  return {
    title: webinar.title,
    description,
    // Drafts and cancelled webinars stay out of search results.
    robots: { index: webinar.status === "published" },
    openGraph: { title: webinar.title, description, type: "website", images: [image] },
    twitter: {
      card: "summary_large_image",
      title: webinar.title,
      description,
      images: [image.url],
    },
  };
}

function checkInLabels(t: Translator) {
  return {
    title: t.t("webinar.checkin.title"),
    body: t.t("webinar.checkin.body"),
    label: t.t("webinar.checkin.label"),
    submit: t.t("webinar.checkin.submit"),
    done: t.t("webinar.checkin.done"),
    wrong: t.t("webinar.checkin.wrong"),
    tooMany: t.t("webinar.checkin.tooMany"),
    closed: t.t("webinar.checkin.closed"),
  };
}

function CancelButton(props: { t: Translator; slug: string; registrationId: string }) {
  return (
    <form action={cancelRegistrationAction}>
      <input type="hidden" name="slug" value={props.slug} />
      <input type="hidden" name="registration" value={props.registrationId} />
      <SubmitButton className="btn btn-ghost btn-sm" confirm={props.t.t("webinar.cancelConfirm")}>
        {props.t.t("webinar.cancel")}
      </SubmitButton>
    </form>
  );
}

/** What the registrant sees where the form was: their seat, the way in, the check-in. */
function Registered(props: {
  t: Translator;
  page: WebinarPage;
  registration: ViewerRegistration;
  now: Date;
}) {
  const { t, page, registration, now } = props;
  const { webinar } = page;
  const seated = registration.status === "registered";
  const joinable = seated && joinLinkVisible(webinar, now);
  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-card bg-primary-soft p-4">
        {seated ? (
          <CircleCheck aria-hidden size={22} className="mt-0.5 shrink-0" />
        ) : (
          <Clock aria-hidden size={22} className="mt-0.5 shrink-0" />
        )}
        <div className="space-y-1">
          <p className="font-semibold">
            {t.t(seated ? "webinar.status.registered" : "webinar.status.waitlist")}
          </p>
          {/* Once the link is here, the promise of it is not needed. */}
          {!joinable && (
            <p className="text-sm">
              {seated
                ? t.t("webinar.status.registeredBody", { minutes: JOIN_OPENS_MINUTES })
                : t.t("webinar.status.waitlistBody")}
            </p>
          )}
        </div>
      </div>
      {joinable && (
        // The join link, only for a seat and only from shortly before the start.
        <div className="space-y-2">
          {registration.joinUrl ? (
            <a
              href={registration.joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary w-full"
            >
              <Video aria-hidden size={18} /> {t.t("webinar.join")}{" "}
              <ExternalLink aria-hidden size={14} />
            </a>
          ) : (
            <p className="text-sm font-semibold">{t.t("webinar.joinSoon")}</p>
          )}
          {registration.joinUrl && <p className="text-xs text-muted">{t.t("webinar.joinHint")}</p>}
        </div>
      )}
      {seated &&
        (registration.attended ? (
          <p className="flex items-center gap-2 font-semibold">
            <CircleCheck aria-hidden size={18} /> {t.t("webinar.status.attended")}
          </p>
        ) : (
          checkinOpen(webinar, now) && <CheckInForm slug={webinar.slug} labels={checkInLabels(t)} />
        ))}
      <div className="flex flex-wrap items-center gap-2">
        {seated && (
          <a
            href={`/webinars/${webinar.slug}/event.ics`}
            className="btn btn-secondary btn-sm"
            download
          >
            <CalendarPlus aria-hidden size={16} /> {t.t("webinar.addToCalendar")}
          </a>
        )}
        <CancelButton t={t} slug={webinar.slug} registrationId={registration.id} />
      </div>
    </div>
  );
}

/** The series this session belongs to: its sessions, and what registering here does. */
function SeriesNote(props: {
  t: Translator;
  series: SeriesOverview;
  current: string;
  /** The viewer has this session already. */
  registered: boolean;
}) {
  const { t, series } = props;
  const course = localize(series.course.title, t.locale);
  const count = series.sessions.filter((session) => session.status !== "cancelled").length;
  return (
    <div className="space-y-3 rounded-card border border-line p-4 text-sm">
      <p className="flex items-start gap-2 font-semibold">
        <CalendarDays aria-hidden size={18} className="mt-0.5 shrink-0" />
        {t.t("webinar.series.title", { course })}
      </p>
      {!series.enrolled && !props.registered && <p>{t.t("webinar.series.body", { n: count })}</p>}
      <ol className="space-y-1">
        {series.sessions.map((session) => (
          <li
            key={session.webinarId}
            className={session.status === "cancelled" ? "line-through" : ""}
          >
            {session.webinarId === props.current ? (
              <span className="font-semibold" lang={session.locale}>
                {session.title}
              </span>
            ) : (
              <Link href={`/webinars/${session.slug}`} className="underline" lang={session.locale}>
                {session.title}
              </Link>
            )}
            <span className="text-muted">
              {" "}
              ·{" "}
              {formatWebinarTime(
                session.startsAt,
                session.durationMinutes,
                session.timeZone,
                t.locale,
              )}
            </span>
          </li>
        ))}
      </ol>
      {series.enrolled ? (
        <p className="space-x-2">
          <span>{t.t("webinar.series.enrolled")}</span>
          <Link href={`/courses/${series.course.slug}`} className="font-semibold underline">
            {t.t("webinar.series.open")}
          </Link>
        </p>
      ) : (
        props.registered && (
          // Registered before the session joined a series: the course is one step away.
          <a
            href={`/start?${entryQuery({ course: series.course.slug })}`}
            className="btn btn-secondary btn-sm"
          >
            {t.t("webinar.series.start")}
          </a>
        )
      )}
    </div>
  );
}

/**
 * A webinar's landing page (webinar brief §2.2): the academy's theme, the
 * blocks the authors chose, the time in the webinar's zone and the viewer's,
 * and where the form goes, whatever state the viewer and the webinar are in.
 */
export default async function WebinarPageView({
  params,
  searchParams,
}: PageProps<"/webinars/[slug]">) {
  const { slug } = await params;
  const query = await searchParams;
  const { tenant, session, page } = await load(slug);
  if (!page) notFound();
  const t = await getTranslator();
  const now = new Date();
  const { webinar } = page;
  const phase = webinarPhase(webinar, now);
  const academy = tenant.settings.author_display_name;

  // utm_* on the landing link (or carried back through sign-in) stay with the registration.
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") search.set(key, value);
  }
  const entry = {
    ...parseEntryParams(search, { tenantLocales: tenant.settings.locales }),
    ...(decodeEntryContext(typeof query.ctx === "string" ? query.ctx : null) ?? {}),
  };
  const team = session !== null && can(session.roles, "studio.view");
  if (webinar.status === "published" && !team && !isBot((await headers()).get("user-agent"))) {
    await recordWebinarView(getDb(), tenant.id, webinar, { locale: t.locale, entry });
  }
  const registration = session
    ? await viewerRegistration(getDb(), tenant.id, webinar.id, session.viewer.userId)
    : null;
  const view = landingView({
    webinar,
    course: page.course,
    taken: page.taken,
    fallback: tenant.settings.default_locale,
    now,
  });
  const labels = formLabels(t, {
    academy,
    title: webinar.title,
    recorded: webinar.recorded,
    recordingNotice: webinar.recordingNotice,
    email: session?.viewer.email ?? null,
    linkMinutes: MAGIC_LINK_TTL_MINUTES,
  });
  const active =
    registration && (registration.status === "registered" || registration.status === "waitlist")
      ? registration
      : null;
  const open = registrationOpen(webinar, now);
  const courseHref =
    page.course?.published &&
    `/start?${entryQuery({
      course: page.course.slug,
      utm: { source: "webinar", medium: "landing", campaign: webinar.slug },
    })}`;

  let register;
  if (webinar.status === "cancelled") {
    register = (
      <div className="space-y-3">
        <p>{t.t("webinar.cancelledBody", { academy })}</p>
        <Link href="/webinars" className="btn btn-secondary">
          {t.t("webinar.moreWebinars")}
        </Link>
      </div>
    );
  } else if (phase === "ended") {
    register = (
      <div className="space-y-4">
        {active?.attended && (
          <p className="flex items-center gap-2">
            <CircleCheck aria-hidden size={18} /> {t.t("webinar.status.attended")}
          </p>
        )}
        {active?.status === "registered" && !active.attended && checkinOpen(webinar, now) && (
          <CheckInForm slug={webinar.slug} labels={checkInLabels(t)} />
        )}
        {courseHref && page.course ? (
          <>
            <p>{t.t("webinar.endedCourse", { course: view.course?.title ?? "" })}</p>
            <a href={courseHref} className="btn btn-primary">
              {t.t("webinar.courseCta")}
            </a>
          </>
        ) : (
          <>
            <p>{t.t("webinar.endedNoCourse")}</p>
            <Link href="/webinars" className="btn btn-secondary">
              {t.t("webinar.moreWebinars")}
            </Link>
          </>
        )}
      </div>
    );
  } else if (active) {
    register = <Registered t={t} page={page} registration={active} now={now} />;
  } else if (webinar.status === "draft") {
    register = (
      <FormFieldsView
        form={webinar.form}
        labels={labels}
        contentLocale={webinar.locale}
        signedIn={false}
        disabled
      />
    );
  } else if (!open) {
    register = <p>{t.t("webinar.registrationClosed")}</p>;
  } else {
    register = (
      <div className="space-y-4">
        {registration?.status === "cancelled" && (
          <p className="text-sm text-muted">{t.t("webinar.status.cancelled")}</p>
        )}
        <RegistrationForm
          slug={webinar.slug}
          form={webinar.form}
          labels={labels}
          contentLocale={webinar.locale}
          signedIn={session !== null}
          waitlist={view.seats.state === "full"}
          ctx={isEmptyEntryContext(entry) ? null : encodeEntryContext(entry)}
          privacyUrl={tenant.settings.legal_links.privacy}
        />
      </div>
    );
  }

  // A session of a series (webinar brief §2.7): registering here starts the whole course.
  const series = await seriesOverview(getDb(), tenant.id, webinar, session?.viewer.userId ?? null);
  if (series && webinar.status !== "cancelled") {
    register = (
      <div className="space-y-5">
        <SeriesNote t={t} series={series} current={webinar.id} registered={active !== null} />
        {register}
      </div>
    );
  }

  const confirmed = query.confirmed;
  const notice =
    webinar.status === "draft" ? (
      <Notice tone="warning" title={t.t("webinar.draft")} />
    ) : confirmed === "registered" || confirmed === "waitlist" ? (
      <Notice
        tone="good"
        title={t.t(
          confirmed === "registered" ? "webinar.confirm.registered" : "webinar.confirm.waitlist",
        )}
      />
    ) : query.confirm === "invalid" ? (
      <Notice tone="warning" title={t.t("webinar.confirm.invalid")} />
    ) : query.confirm === "closed" ? (
      <Notice tone="warning" title={t.t("webinar.registrationClosed")} />
    ) : query.cancelled === "1" ? (
      <Notice tone="info" title={t.t("webinar.cancelledNotice")} />
    ) : null;

  const cta =
    webinar.status === "published" && phase !== "ended" && !active && open
      ? t.t(view.seats.state === "full" ? "webinar.waitlistCta" : "webinar.registerCta")
      : null;

  return (
    <WebinarLanding
      view={view}
      t={t}
      brand={{ name: academy, logo: tenant.theme.logo?.src }}
      anonymity={tenant.settings.anonymity_mode}
      register={register}
      registerHeading={
        webinar.status === "cancelled"
          ? t.t("webinar.cancelledTitle")
          : phase === "ended"
            ? t.t("webinar.endedTitle")
            : undefined
      }
      notice={notice}
      cta={cta}
    />
  );
}
