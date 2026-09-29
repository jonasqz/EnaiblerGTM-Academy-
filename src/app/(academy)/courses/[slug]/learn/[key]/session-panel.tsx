import {
  CalendarPlus,
  CircleCheck,
  Clock,
  ExternalLink,
  PlayCircle,
  TriangleAlert,
  Video,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import {
  registerForSessionAction,
  sessionCheckInAction,
} from "@/app/(academy)/courses/[slug]/actions";
import { CheckInForm } from "@/app/(academy)/webinars/[slug]/checkin-form";
import { MediaBlock } from "@/components/media/media-block";
import type { WatchResult } from "@/components/media/use-watch-reporting";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { LocalTime } from "@/components/webinars/local-time";
import type { SessionOutcome, SessionRequirement } from "@/core/courses/sessions";
import type { Translator } from "@/core/i18n/translator";
import type { MediaViewer } from "@/core/media/access";
import { JOIN_OPENS_MINUTES, registrationOpen, webinarPhase } from "@/core/webinars/phase";
import { formatWebinarTime } from "@/core/webinars/time";
import type { LearnerSession } from "@/server/courses/sessions";
import type { MediaAsset } from "@/server/media/library";

const OUTCOME: Record<SessionOutcome, { tone: BadgeTone; icon: LucideIcon }> = {
  upcoming: { tone: "info", icon: Clock },
  live: { tone: "info", icon: Video },
  attended: { tone: "good", icon: CircleCheck },
  watched: { tone: "good", icon: CircleCheck },
  catch_up: { tone: "warning", icon: PlayCircle },
  missed: { tone: "serious", icon: TriangleAlert },
  cancelled: { tone: "neutral", icon: XCircle },
};

/** "Missed live: watch the recording by 13 Oct" and the rest, in the learner's words. */
export function sessionStateText(t: Translator, session: LearnerSession): string {
  if (session.outcome === "catch_up") {
    return session.catchUpUntil
      ? t.t("session.state.catch_up", {
          date: shortDate(t, session.catchUpUntil, session.webinar.timeZone),
        })
      : t.t("session.state.catchUpOpen");
  }
  return t.t(`session.state.${session.outcome}`);
}

export function SessionBadge(props: { t: Translator; session: LearnerSession }) {
  const style = OUTCOME[props.session.outcome];
  return (
    <Badge tone={style.tone} icon={style.icon}>
      {sessionStateText(props.t, props.session)}
    </Badge>
  );
}

/** "13 Oct": a deadline's day in the session's own zone, where its date and time are shown. */
function shortDate(t: Translator, date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(t.locale === "de" ? "de-DE" : "en-GB", {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(date);
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

/**
 * A lesson that is a live session (webinar brief §2.5): its time in the
 * webinar's zone and the viewer's own, the learner's seat, the way in and
 * the check-in while they are open, and afterwards the recording through the
 * re-live player. The lesson completes itself from attending or watching.
 */
export function SessionPanel(props: {
  t: Translator;
  session: LearnerSession;
  courseSlug: string;
  lessonKey: string;
  academy: string;
  requirement: SessionRequirement;
  watchedPercent: number;
  recording: MediaAsset | undefined;
  viewer: MediaViewer | null;
  progress: (WatchResult & { positionSec: number | null }) | null;
  now: Date;
}) {
  const { t, session } = props;
  const { webinar } = session;
  // By the clock, not by the outcome: someone checked in while it runs still needs the way in.
  const ended = webinarPhase(webinar, props.now) === "ended";
  const status = session.registration?.status;
  const seated = status === "registered";
  const open = webinar.status === "published" && registrationOpen(webinar, props.now);
  const language = t.t(webinar.locale === "de" ? "webinar.language.de" : "webinar.language.en");

  return (
    <section
      aria-label={t.t("session.eyebrow")}
      className="space-y-5 rounded-card border border-line p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">
            {formatWebinarTime(
              webinar.startsAt,
              webinar.durationMinutes,
              webinar.timeZone,
              t.locale,
            )}
          </p>
          <LocalTime
            startsAt={webinar.startsAt.toISOString()}
            durationMinutes={webinar.durationMinutes}
            timeZone={webinar.timeZone}
            locale={t.locale}
            label={t.t("webinar.yourTime")}
          />
          <p className="text-sm text-muted">{t.t("webinar.heldIn", { language })}</p>
        </div>
        <SessionBadge t={t} session={session} />
      </div>

      {session.outcome === "cancelled" ? (
        <p>{t.t("session.cancelledBody", { academy: props.academy })}</p>
      ) : (
        !ended && (
          <div className="space-y-3">
            {seated ? (
              <p className="flex items-center gap-2 font-semibold">
                <CircleCheck aria-hidden size={18} /> {t.t("session.seat")}
              </p>
            ) : status === "waitlist" ? (
              <p className="flex items-start gap-2">
                <Clock aria-hidden size={18} className="mt-0.5 shrink-0" />{" "}
                {t.t("session.waitlist")}
              </p>
            ) : (
              <div className="space-y-2">
                <p>{t.t("session.notRegistered")}</p>
                {open ? (
                  <form action={registerForSessionAction}>
                    <input type="hidden" name="slug" value={props.courseSlug} />
                    <input type="hidden" name="key" value={props.lessonKey} />
                    <input type="hidden" name="webinar" value={webinar.id} />
                    <SubmitButton className="btn btn-primary btn-sm">
                      {t.t("session.register")}
                    </SubmitButton>
                  </form>
                ) : (
                  <p className="text-sm text-muted">{t.t("session.closed")}</p>
                )}
              </div>
            )}
            {session.joinUrl ? (
              // The join link, only for a seat and only from shortly before the start.
              <div className="space-y-1">
                <a
                  href={session.joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                >
                  <Video aria-hidden size={18} /> {t.t("session.join")}{" "}
                  <ExternalLink aria-hidden size={14} />
                </a>
                <p className="text-xs text-muted">{t.t("webinar.joinHint")}</p>
              </div>
            ) : (
              seated && (
                <p className="text-sm text-muted">
                  {t.t("session.joinLater", { minutes: JOIN_OPENS_MINUTES })}
                </p>
              )
            )}
            {webinar.recorded && (
              <p className="text-sm text-muted">
                {webinar.recordingNotice ??
                  t.t("webinar.form.recording", { academy: props.academy })}
              </p>
            )}
          </div>
        )
      )}

      {/* Once checked in, the field gives way to the confirmation (the page reloads with it). */}
      {session.attended && !ended && (
        <p role="status" className="flex items-center gap-2 font-semibold">
          <CircleCheck aria-hidden size={20} /> {t.t("webinar.checkin.done")}
        </p>
      )}
      {session.checkinOpen && (
        <CheckInForm
          slug={webinar.slug}
          course={{ slug: props.courseSlug, action: sessionCheckInAction }}
          labels={checkInLabels(t)}
        />
      )}

      {ended && session.outcome !== "cancelled" && <SessionRecording {...props} />}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {seated && !ended && (
          <a
            href={`/webinars/${webinar.slug}/event.ics`}
            className="btn btn-secondary btn-sm"
            download
          >
            <CalendarPlus aria-hidden size={16} /> {t.t("webinar.addToCalendar")}
          </a>
        )}
        <Link href={`/webinars/${webinar.slug}`} className="btn btn-ghost btn-sm">
          {t.t("session.page")}
        </Link>
      </div>
    </section>
  );
}

/** After the session: its recording through the re-live player, and what watching it counts for. */
function SessionRecording(props: Parameters<typeof SessionPanel>[0]) {
  const { t, session } = props;
  const { webinar } = session;
  const rule = props.requirement.rule;
  const hint =
    session.attended || session.outcome === "watched"
      ? null
      : rule === "attended"
        ? t.t("session.recordingDoesNotCount")
        : session.outcome === "missed" && session.catchUpUntil
          ? t.t("session.catchUpOver", {
              date: shortDate(t, session.catchUpUntil, webinar.timeZone),
            })
          : rule === "attended_or_watched"
            ? session.catchUpUntil
              ? t.t("session.catchUpHint", {
                  percent: props.watchedPercent,
                  date: shortDate(t, session.catchUpUntil, session.webinar.timeZone),
                })
              : t.t("session.catchUpHintOpen", { percent: props.watchedPercent })
            : null;
  if (!webinar.recordingAssetId) {
    return webinar.recorded ? (
      <p className="text-sm text-muted">
        {t.t("session.recordingSoon", { academy: props.academy })}
      </p>
    ) : null;
  }
  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl">{t.t("session.recording")}</h2>
      {hint && <Notice tone={session.outcome === "catch_up" ? "info" : "warning"} title={hint} />}
      <MediaBlock asset={props.recording} t={t} viewer={props.viewer} progress={props.progress} />
    </div>
  );
}
