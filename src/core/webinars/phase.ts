/**
 * Where a webinar is in its life, computed from its times and never stored
 * (webinar brief §4): the status says whether it is published or cancelled,
 * the clock says whether it is still to come, running or over.
 */
export type WebinarPhase = "upcoming" | "live" | "ended";

export interface WebinarTimes {
  startsAt: Date;
  durationMinutes: number;
}

/** The join link appears this long before the start, on the page and in the "starting now" mail. */
export const JOIN_OPENS_MINUTES = 15;

/** The check-in code is taken from a little before the start until a while after the end. */
export const CHECKIN_OPENS_MINUTES = 15;
export const CHECKIN_CLOSES_MINUTES_AFTER_END = 30;

const MINUTE = 60_000;

export function webinarEnd(webinar: WebinarTimes): Date {
  return new Date(webinar.startsAt.getTime() + webinar.durationMinutes * MINUTE);
}

export function webinarPhase(webinar: WebinarTimes, now: Date): WebinarPhase {
  if (now.getTime() < webinar.startsAt.getTime()) return "upcoming";
  if (now.getTime() < webinarEnd(webinar).getTime()) return "live";
  return "ended";
}

/** Whether a registrant with a seat sees the join link now. */
export function joinLinkVisible(webinar: WebinarTimes, now: Date): boolean {
  const opens = webinar.startsAt.getTime() - JOIN_OPENS_MINUTES * MINUTE;
  return now.getTime() >= opens && now.getTime() < webinarEnd(webinar).getTime();
}

export function checkinOpen(webinar: WebinarTimes, now: Date): boolean {
  const opens = webinar.startsAt.getTime() - CHECKIN_OPENS_MINUTES * MINUTE;
  const closes = webinarEnd(webinar).getTime() + CHECKIN_CLOSES_MINUTES_AFTER_END * MINUTE;
  return now.getTime() >= opens && now.getTime() < closes;
}

export type WebinarStatus = "draft" | "published" | "cancelled";

/** People can register (or join the waitlist) for a published webinar until it ends. */
export function registrationOpen(
  webinar: WebinarTimes & { status: WebinarStatus },
  now: Date,
): boolean {
  return webinar.status === "published" && webinarPhase(webinar, now) !== "ended";
}

/**
 * A pending registration (the form was sent, the address not yet proven)
 * holds no seat and is removed after this long; the sign-in link in its
 * mail stopped working long before.
 */
export const PENDING_REGISTRATION_HOURS = 24;

export function pendingExpiresAt(now: Date): Date {
  return new Date(now.getTime() + PENDING_REGISTRATION_HOURS * 60 * MINUTE);
}
