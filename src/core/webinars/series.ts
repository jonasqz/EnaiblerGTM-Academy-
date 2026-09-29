import { webinarUid, type IcsEvent } from "@/core/webinars/ics";
import { registrationOpen, webinarEnd, type WebinarStatus } from "@/core/webinars/phase";
import type { RegistrationStatus } from "@/core/webinars/registration";

/**
 * A series is a course whose lessons include live sessions (webinar brief
 * §2.7), and enrolling is one registration for all of them. Each session
 * keeps its own seat, waitlist and reminders; the learner gets one
 * confirmation with every date in one calendar file.
 */
export interface SeriesSession {
  webinarId: string;
  status: WebinarStatus;
  startsAt: Date;
  durationMinutes: number;
  /** The learner's own registration for it, if they have one. */
  registration: RegistrationStatus | null;
}

/**
 * The sessions to register a learner for. Enrolling takes every session
 * still open, including one they had cancelled before they chose the whole
 * series. A session added later is only offered to those who never had it:
 * a cancellation stays their choice.
 */
export function sessionsToRegister(
  sessions: readonly SeriesSession[],
  reason: "enrolled" | "added",
  now: Date,
): string[] {
  return sessions
    .filter((session) => {
      if (!registrationOpen(session, now)) return false;
      if (session.registration === null || session.registration === "pending") return true;
      return session.registration === "cancelled" && reason === "enrolled";
    })
    .map((session) => session.webinarId);
}

/**
 * The calendar entries of a series: one per session with a seat, each with
 * the UID and SEQUENCE its own invitations use, so a later change or
 * cancellation of one session updates the same entry.
 */
export function seriesEvents(
  sessions: ReadonlyArray<{
    id: string;
    title: string;
    startsAt: Date;
    durationMinutes: number;
    sequence: number;
    /** The session's page on the academy. */
    url: string;
  }>,
  options: { domain: string; note: string },
): IcsEvent[] {
  return [...sessions]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((session) => ({
      uid: webinarUid(session.id, options.domain),
      sequence: session.sequence,
      start: session.startsAt,
      end: webinarEnd(session),
      summary: session.title,
      description: `${options.note}\n${session.url}`,
      url: session.url,
      location: session.url,
    }));
}
