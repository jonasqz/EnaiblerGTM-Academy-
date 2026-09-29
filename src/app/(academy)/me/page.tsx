import {
  Award,
  BookOpen,
  CalendarDays,
  CalendarX,
  CircleCheck,
  Clapperboard,
  Clock,
  Download,
  Globe,
  Lock,
  Mail,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  deleteMyDataAction,
  saveContactOptInAction,
  saveDisplayNameAction,
  subscribeNewsAction,
  unsubscribeNewsAction,
} from "@/app/(academy)/me/actions";
import { setCredentialVisibility } from "@/app/(academy)/verify/[publicId]/actions";
import { cancelRegistrationAction } from "@/app/(academy)/webinars/[slug]/actions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { SubmitButton } from "@/components/ui/submit-button";
import { nextStepHref } from "@/core/courses/next-step";
import { proofLine } from "@/core/credentials/proof";
import { localize } from "@/core/i18n/locales";
import { pathColor } from "@/core/theme/css";
import { formatWebinarTime } from "@/core/webinars/time";
import { getDb } from "@/db/client";
import { requireViewer } from "@/server/access";
import { loadMarketingConsent } from "@/server/consent";
import { loadMe } from "@/server/profile";
import { getTranslator } from "@/server/request";
import { myWebinars } from "@/server/webinars/public";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t.t("me.title"), robots: { index: false } };
}

export default async function MePage({ searchParams }: PageProps<"/me">) {
  const { news: newsNotice } = await searchParams;
  const { tenant, viewer } = await requireViewer("/me");
  const t = await getTranslator();
  const [me, news, webinars] = await Promise.all([
    loadMe(getDb(), tenant, viewer.userId),
    loadMarketingConsent(getDb(), tenant.id, viewer.userId),
    myWebinars(getDb(), tenant.id, viewer.userId),
  ]);
  const fallback = [tenant.settings.default_locale];
  const academy = tenant.settings.author_display_name;
  const named = Boolean(me.profile?.displayName);

  return (
    <div className="space-y-12">
      <PageHeader eyebrow={viewer.email} title={t.t("me.title")} />

      {me.path && (
        <section className="card flex flex-wrap items-center gap-5 p-5">
          <span
            className="grid size-14 place-items-center rounded-control border-outline border-line font-display text-2xl"
            style={{ background: pathColor(tenant.theme, 0, me.path.color) }}
          >
            {me.path.visual?.svg || me.path.visual?.png ? (
              // eslint-disable-next-line @next/next/no-img-element -- uploaded path picture
              <img
                src={me.path.visual.svg ?? me.path.visual.png}
                alt=""
                className="size-11 object-contain"
              />
            ) : (
              localize(me.path.title, t.locale, fallback).slice(0, 1)
            )}
          </span>
          <div>
            <p className="eyebrow">{t.t("me.yourPath")}</p>
            <p className="font-display text-2xl">{localize(me.path.title, t.locale, fallback)}</p>
          </div>
        </section>
      )}

      <section className="space-y-4" aria-labelledby="creds-heading">
        <h2 id="creds-heading" className="font-display text-2xl">
          {t.term("credential", { plural: true })}
        </h2>
        {me.credentials.length === 0 ? (
          <EmptyState icon={Award} title={t.t("me.noCredentials")} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {me.credentials.map(({ credential }) => (
              <li key={credential.id} className="card flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow">{t.term("credential")}</p>
                    <p className="font-display text-xl">
                      {localize(credential.courseTitle, t.locale, fallback)}
                    </p>
                    <p className="text-sm text-muted">{proofLine(t, credential)}</p>
                  </div>
                  {credential.visibility === "public" ? (
                    <Badge tone="good" icon={Globe}>
                      {t.t("me.public")}
                    </Badge>
                  ) : (
                    <Badge icon={Lock}>{t.t("me.private")}</Badge>
                  )}
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Link
                    href={`/verify/${credential.publicId}`}
                    className="btn btn-secondary btn-sm"
                  >
                    {t.t("me.view")}
                  </Link>
                  <form action={setCredentialVisibility}>
                    <input type="hidden" name="publicId" value={credential.publicId} />
                    <input
                      type="hidden"
                      name="visibility"
                      value={credential.visibility === "public" ? "private" : "public"}
                    />
                    <button
                      type="submit"
                      className="btn btn-ghost btn-sm"
                      disabled={credential.visibility === "private" && !named}
                      title={
                        credential.visibility === "private" && !named
                          ? t.t("me.nameMissing")
                          : undefined
                      }
                    >
                      {credential.visibility === "public"
                        ? t.t("verify.makePrivate")
                        : t.t("verify.makePublic")}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="courses-heading">
        <h2 id="courses-heading" className="font-display text-2xl">
          {t.term("course", { plural: true })}
        </h2>
        {me.courses.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={t.t("me.noCourses")}
            action={
              <Link href="/#courses" className="btn btn-primary">
                {t.t("home.browse")}
              </Link>
            }
          />
        ) : (
          <ul className="card-flat divide-y divide-line">
            {me.courses.map(({ course, enrollment, progress, next, nextSession }) => {
              const title = localize(course.title, t.locale, fallback);
              const nextLabel =
                next.kind === "lesson"
                  ? t.t("course.continue")
                  : next.kind === "work"
                    ? t.t("course.openAssignment")
                    : next.kind === "test"
                      ? t.t(next.retake ? "course.test.retake" : "course.test.take")
                      : t.t("me.view");
              return (
                <li key={course.id} className="flex flex-wrap items-center gap-4 p-4">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Link
                      href={`/courses/${course.slug}`}
                      className="font-semibold hover:underline"
                    >
                      {title}
                    </Link>
                    {!enrollment.completedAt && (
                      <>
                        <Progress
                          value={progress.percent}
                          label={t.t("course.progress", {
                            done: progress.done,
                            total: progress.total,
                          })}
                          className="max-w-xs"
                        />
                        <p className="text-xs text-muted">
                          {t.t("course.progress", { done: progress.done, total: progress.total })}
                        </p>
                      </>
                    )}
                    {!enrollment.completedAt && nextSession && (
                      <Link
                        href={`/courses/${course.slug}/learn/${nextSession.lessonKey}`}
                        className="flex items-center gap-1.5 text-sm hover:underline"
                      >
                        <CalendarDays aria-hidden size={14} className="shrink-0" />
                        {t.t("series.next", {
                          time: formatWebinarTime(
                            nextSession.webinar.startsAt,
                            nextSession.webinar.durationMinutes,
                            nextSession.webinar.timeZone,
                            t.locale,
                          ),
                        })}
                      </Link>
                    )}
                  </div>
                  {enrollment.completedAt ? (
                    <Badge tone="good" icon={CircleCheck}>
                      {t.t("home.completed")}
                    </Badge>
                  ) : next.kind === "review" ? (
                    <Badge tone="info" icon={Clock}>
                      {t.t("assignment.inReview")}
                    </Badge>
                  ) : (
                    <Link
                      href={nextStepHref(course.slug, next)}
                      className="btn btn-secondary btn-sm"
                      aria-label={`${nextLabel}: ${title}`}
                    >
                      {nextLabel}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {webinars.length > 0 && (
        <section id="webinars" className="scroll-mt-8 space-y-4" aria-labelledby="webinars-heading">
          <h2 id="webinars-heading" className="font-display text-2xl">
            {t.t("me.webinarsTitle")}
          </h2>
          <ul className="card-flat divide-y divide-line">
            {webinars.map((webinar) => (
              <li key={webinar.registrationId} className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <Link
                    href={`/webinars/${webinar.slug}`}
                    className="font-semibold hover:underline"
                    lang={webinar.locale}
                  >
                    {webinar.title}
                  </Link>
                  <p className="text-sm text-muted">
                    {formatWebinarTime(
                      webinar.startsAt,
                      webinar.durationMinutes,
                      webinar.timeZone,
                      t.locale,
                    )}
                  </p>
                  {webinar.relive === "ready" && (
                    <Link
                      href={`/webinars/${webinar.slug}#recording`}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
                    >
                      <Clapperboard aria-hidden size={16} /> {t.t("me.webinar.recording")}
                    </Link>
                  )}
                </div>
                {webinar.webinarStatus === "cancelled" ? (
                  <Badge tone="warning" icon={CalendarX}>
                    {t.t("me.webinar.cancelled", { academy })}
                  </Badge>
                ) : webinar.attended ? (
                  <Badge tone="good" icon={CircleCheck}>
                    {t.t("me.webinar.attended")}
                  </Badge>
                ) : webinar.phase === "ended" ? (
                  <Badge icon={Clock}>{t.t("me.webinar.ended")}</Badge>
                ) : (
                  <>
                    <Badge tone={webinar.status === "registered" ? "good" : "info"} icon={Clock}>
                      {t.t(
                        webinar.status === "registered"
                          ? "me.webinar.registered"
                          : "me.webinar.waitlist",
                      )}
                    </Badge>
                    <form action={cancelRegistrationAction}>
                      <input type="hidden" name="slug" value={webinar.slug} />
                      <input type="hidden" name="registration" value={webinar.registrationId} />
                      <input type="hidden" name="back" value="me" />
                      <SubmitButton
                        className="btn btn-ghost btn-sm"
                        confirm={t.t("webinar.cancelConfirm")}
                      >
                        {t.t("webinar.cancel")}
                      </SubmitButton>
                    </form>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <form action={saveDisplayNameAction} className="card-flat space-y-3 p-5">
          <h2 className="font-semibold">{t.t("me.nameTitle")}</h2>
          <p className="hint">{t.t("me.nameHint")}</p>
          <div className="flex gap-2">
            <input
              name="displayName"
              defaultValue={me.profile?.displayName ?? ""}
              maxLength={120}
              className="input"
              autoComplete="name"
            />
            <button type="submit" className="btn btn-secondary">
              {t.t("me.save")}
            </button>
          </div>
        </form>

        <form action={saveContactOptInAction} className="card-flat space-y-3 p-5">
          <h2 className="font-semibold">{t.t("me.contactTitle", { academy })}</h2>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="optIn"
              defaultChecked={me.contactOptIn}
              className="mt-1 size-4"
            />
            <span className="text-sm">{t.t("me.contactLabel", { academy })}</span>
          </label>
          <p className="hint">{t.t("me.contactHint")}</p>
          <button type="submit" className="btn btn-secondary btn-sm">
            {t.t("me.save")}
          </button>
        </form>
      </section>

      <section
        id="news"
        className="card-flat scroll-mt-8 space-y-3 p-5"
        aria-labelledby="news-heading"
      >
        <h2 id="news-heading" className="flex items-center gap-2 font-semibold">
          <Mail aria-hidden size={18} /> {t.t("me.newsTitle", { academy })}
        </h2>
        {newsNotice === "sent" && news.state === "pending" && (
          <Notice tone="good" title={t.t("me.newsSent")} />
        )}
        {newsNotice === "failed" && <Notice tone="critical" title={t.t("me.newsSendFailed")} />}
        {news.state === "confirmed" ? (
          <form action={unsubscribeNewsAction} className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-sm">
              {t.t("me.newsConfirmed", {
                academy,
                date: news.confirmedAt!.toLocaleDateString(t.locale === "de" ? "de-DE" : "en-GB", {
                  dateStyle: "medium",
                }),
              })}
            </p>
            <button type="submit" className="btn btn-secondary btn-sm">
              {t.t("me.newsUnsubscribe")}
            </button>
          </form>
        ) : news.state === "pending" ? (
          <div className="flex flex-wrap items-center gap-3">
            {newsNotice !== "sent" && (
              <p className="w-full text-sm">{t.t("me.newsPending", { email: viewer.email })}</p>
            )}
            <form action={subscribeNewsAction}>
              <input type="hidden" name="agree" value="on" />
              <button type="submit" className="btn btn-secondary btn-sm">
                {t.t("me.newsResend")}
              </button>
            </form>
            <form action={unsubscribeNewsAction}>
              <button type="submit" className="btn btn-ghost btn-sm">
                {t.t("me.newsCancel")}
              </button>
            </form>
          </div>
        ) : (
          <form action={subscribeNewsAction} className="space-y-3">
            <label className="flex items-start gap-3">
              <input type="checkbox" name="agree" required className="mt-1 size-4" />
              <span className="text-sm">{t.t("me.newsLabel", { academy })}</span>
            </label>
            <button type="submit" className="btn btn-secondary btn-sm">
              {t.t("me.newsSubscribe")}
            </button>
          </form>
        )}
        <p className="hint">{t.t("me.newsHint")}</p>
      </section>

      <section id="data" className="card-flat space-y-4 p-5" aria-labelledby="data-heading">
        <h2 id="data-heading" className="font-semibold">
          {t.t("me.dataTitle")}
        </h2>
        <a href="/me/export" className="btn btn-secondary btn-sm">
          <Download aria-hidden size={16} /> {t.t("me.export")}
        </a>
        <form action={deleteMyDataAction} className="space-y-3 border-t border-line pt-4">
          <p className="text-sm text-muted">{t.t("me.deleteBody")}</p>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" name="confirm" required className="size-4" />
            {t.t("me.deleteConfirm")}
          </label>
          <button type="submit" className="btn btn-danger btn-sm">
            {t.t("me.deleteButton")}
          </button>
        </form>
      </section>
    </div>
  );
}
