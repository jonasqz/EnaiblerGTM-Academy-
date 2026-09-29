import { CalendarPlus, CircleCheck, Clock, ExternalLink, Video } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { cancelRegistrationAction } from "@/app/(academy)/webinars/[slug]/actions";
import { CheckInForm } from "@/app/(academy)/webinars/[slug]/checkin-form";
import { RecordingBlock } from "@/app/(academy)/webinars/[slug]/recording";
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
import type { Translator } from "@/core/i18n/translator";
import { isBot } from "@/core/shared/bots";
import {
  checkinOpen,
  joinLinkVisible,
  registrationOpen,
  webinarPhase,
  JOIN_OPENS_MINUTES,
} from "@/core/webinars/phase";
import { reliveState } from "@/core/webinars/relive";
import { getDb } from "@/db/client";
import { getSession } from "@/server/access";
import { MAGIC_LINK_TTL_MINUTES } from "@/server/auth";
import { progressOf } from "@/server/media/progress";
import { mediaViewers } from "@/server/media/viewer";
import { getTenant, getTranslator } from "@/server/request";
import {
  loadWebinarPage,
  recordWebinarView,
  viewerRegistration,
  type ViewerRegistration,
  type WebinarPage,
} from "@/server/webinars/public";

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

/**
 * A webinar's landing page (webinar brief §2.2): the academy's theme, the
 * blocks the authors chose, the time in the webinar's zone and the viewer's,
 * and where the form goes, whatever state the viewer and the webinar are in.
 * Over with a recording, it becomes an evergreen page (brief §3): the
 * recording for those who may watch it, a registration that grants it for
 * everyone else, and the course to build the artifact in.
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
  const relive = reliveState(webinar, page.recording, now);
  const view = landingView({
    webinar,
    course: page.course,
    taken: page.taken,
    fallback: tenant.settings.default_locale,
    now,
    relive,
  });
  const labels = formLabels(t, {
    academy,
    title: webinar.title,
    recorded: webinar.recorded,
    recordingNotice: webinar.recordingNotice,
    email: session?.viewer.email ?? null,
    linkMinutes: MAGIC_LINK_TTL_MINUTES,
    forRecording: relive !== "none",
  });
  const active =
    registration && (registration.status === "registered" || registration.status === "waitlist")
      ? registration
      : null;
  const open = registrationOpen(webinar, now, relive);
  const courseHref =
    page.course?.published &&
    `/start?${entryQuery({
      course: page.course.slug,
      utm: { source: "webinar", medium: "landing", campaign: webinar.slug },
    })}`;
  const ctx = isEmptyEntryContext(entry) ? null : encodeEntryContext(entry);
  const checkIn = active?.status === "registered" &&
    !active.attended &&
    checkinOpen(webinar, now) && <CheckInForm slug={webinar.slug} labels={checkInLabels(t)} />;

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
  } else if (relive !== "none" && page.recording) {
    // Over, with a recording: watch it and build the artifact (webinar brief §3).
    const viewerOf = await mediaViewers(
      getDb(),
      tenant.id,
      session && { userId: session.viewer.userId, roles: session.roles },
      [page.recording],
    );
    const watched = session
      ? await progressOf(getDb(), tenant.id, session.viewer.userId, [page.recording.id])
      : null;
    register = (
      <RecordingBlock
        t={t}
        slug={webinar.slug}
        relive={relive}
        recording={page.recording}
        viewer={viewerOf(page.recording.id)}
        progress={watched?.get(page.recording.id) ?? null}
        registered={active !== null}
        attended={active?.attended ?? false}
        signedIn={session !== null}
        checkIn={checkIn}
        form={
          <RegistrationForm
            slug={webinar.slug}
            form={webinar.form}
            labels={labels}
            contentLocale={webinar.locale}
            signedIn={session !== null}
            waitlist={false}
            ctx={ctx}
            privacyUrl={tenant.settings.legal_links.privacy}
          />
        }
        course={
          courseHref && view.course
            ? { href: courseHref, title: view.course.title, artifact: view.course.artifact }
            : null
        }
      />
    );
  } else if (phase === "ended") {
    register = (
      <div className="space-y-4">
        {active?.attended && (
          <p className="flex items-center gap-2">
            <CircleCheck aria-hidden size={18} /> {t.t("webinar.status.attended")}
          </p>
        )}
        {checkIn}
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
          ctx={ctx}
          privacyUrl={tenant.settings.legal_links.privacy}
        />
      </div>
    );
  }

  const confirmed = query.confirmed;
  const notice =
    webinar.status === "draft" ? (
      <Notice tone="warning" title={t.t("webinar.draft")} />
    ) : (confirmed === "registered" || confirmed === "waitlist") && relive !== "none" ? (
      <Notice
        tone="good"
        title={t.t(relive === "ready" ? "webinar.confirm.relive" : "webinar.confirm.reliveComing")}
      />
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
    relive === "ready"
      ? t.t("webinar.relive.cta")
      : relive === "coming"
        ? active
          ? null
          : t.t("webinar.relive.getCta")
        : webinar.status === "published" && phase !== "ended" && !active && open
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
          : relive === "ready"
            ? t.t("webinar.relive.title")
            : relive === "coming"
              ? t.t("webinar.relive.comingTitle")
              : phase === "ended"
                ? t.t("webinar.endedTitle")
                : undefined
      }
      notice={notice}
      cta={cta}
    />
  );
}
