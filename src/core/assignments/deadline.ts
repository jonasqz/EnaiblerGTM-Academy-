/**
 * A deadline for the homework (webinar brief §2.6: optional, e.g. "before the
 * next session"). Whether a hand-in after it is still taken is the academy's
 * setting (`assignments.late_submissions`, default accepted). Only the first
 * hand-in is held to it: revising work the review sent back stays open, as
 * the brief promises ("revise and resubmit without limit").
 */
export const LATE_SUBMISSIONS = ["accepted", "refused"] as const;
export type LateSubmissions = (typeof LATE_SUBMISSIONS)[number];

/** The reminder goes out this long before the deadline (webinar brief §3). */
export const HOMEWORK_REMINDER_HOURS = 48;
/** From then on the page says the deadline is close. */
export const DEADLINE_SOON_HOURS = 48;

const HOUR = 60 * 60_000;

export type DeadlineState = "none" | "open" | "soon" | "passed";

export function deadlineState(dueAt: Date | null, now: Date): DeadlineState {
  if (!dueAt) return "none";
  if (now.getTime() > dueAt.getTime()) return "passed";
  return dueAt.getTime() - now.getTime() <= DEADLINE_SOON_HOURS * HOUR ? "soon" : "open";
}

/**
 * Whether a hand-in is taken now: on time, late but accepted, or refused.
 * A hand-in exactly at the deadline is on time.
 */
export function handInDecision(input: {
  dueAt: Date | null;
  policy: LateSubmissions;
  /** The learner handed in before: this is a revision of their work. */
  revision: boolean;
  now: Date;
}): "on_time" | "late" | "refused" {
  if (!input.dueAt || input.revision || input.now.getTime() <= input.dueAt.getTime()) {
    return "on_time";
  }
  return input.policy === "refused" ? "refused" : "late";
}

/**
 * When the reminder goes out, or null when its time has passed (like the
 * webinar reminders: someone enrolling the day before gets none, the page
 * tells them). One due within the minute still goes.
 */
export function homeworkReminderAt(dueAt: Date | null, now: Date): Date | null {
  if (!dueAt) return null;
  const at = new Date(dueAt.getTime() - HOMEWORK_REMINDER_HOURS * HOUR);
  return at.getTime() > now.getTime() - 60_000 && dueAt.getTime() > now.getTime() ? at : null;
}

const INTL_LOCALE: Record<string, string> = { en: "en-GB", de: "de-DE" };

/** "Tue, 13 Oct 2026, 18:00 CEST": a deadline in one zone, named, in the reader's language. */
export function formatDeadline(dueAt: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale] ?? locale, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(dueAt);
}

/**
 * Whether a queued reminder still says something true when its time comes:
 * the deadline it names still stands, the learner has not handed in and is
 * still on the course, and the course still asks for the work.
 */
export function homeworkReminderDue(state: {
  /** The deadline the reminder was planned for, and the one now. */
  plannedFor: string;
  dueAt: Date | null;
  enrolled: boolean;
  completed: boolean;
  handedIn: boolean;
  asksForWork: boolean;
}): "send" | "rescheduled" | "handed_in" | "not_enrolled" | "completed" | "no_work" {
  if (!state.enrolled) return "not_enrolled";
  if (!state.asksForWork) return "no_work";
  if (state.completed) return "completed";
  if (!state.dueAt || state.dueAt.toISOString() !== state.plannedFor) return "rescheduled";
  if (state.handedIn) return "handed_in";
  return "send";
}
