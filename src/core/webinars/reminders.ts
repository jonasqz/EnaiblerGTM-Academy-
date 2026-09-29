import { webinarEnd, type WebinarTimes } from "@/core/webinars/phase";

/**
 * The mails around a webinar (webinar brief §3, reminder sequence). The
 * confirmation goes out when the address is proven; the rest is planned
 * from the webinar's time and re-planned when it moves.
 */
export const REMINDER_STEPS = ["reminder_24h", "reminder_1h", "starting", "followup"] as const;
export type ReminderStep = (typeof REMINDER_STEPS)[number];

/**
 * Every mail a registrant can get, for the outbox payload. After the end,
 * a registration is for the recording: its confirmation brings it (or says
 * it is coming), and "relive" brings a recording that became ready later.
 */
export const WEBINAR_MAIL_STEPS = [
  "confirmation",
  "waitlist",
  "promoted",
  ...REMINDER_STEPS,
  "rescheduled",
  "cancelled",
  "registration_cancelled",
  "relive_confirmation",
  "relive",
] as const;
export type WebinarMailStep = (typeof WEBINAR_MAIL_STEPS)[number];

const MINUTE = 60_000;

/** When each reminder is due, relative to the start (the follow-up: after the end). */
export function reminderTime(step: ReminderStep, webinar: WebinarTimes): Date {
  const start = webinar.startsAt.getTime();
  switch (step) {
    case "reminder_24h":
      return new Date(start - 24 * 60 * MINUTE);
    case "reminder_1h":
      return new Date(start - 60 * MINUTE);
    case "starting":
      return new Date(start);
    case "followup":
      return new Date(webinarEnd(webinar).getTime() + 60 * MINUTE);
  }
}

/**
 * The reminders still to send for someone who has a seat now: steps whose
 * time has passed are skipped (registering an hour before gets no 24-hour
 * reminder), and a step due within the minute still goes.
 */
export function reminderSchedule(
  webinar: WebinarTimes,
  now: Date,
): Array<{ step: ReminderStep; sendAt: Date }> {
  return REMINDER_STEPS.map((step) => ({ step, sendAt: reminderTime(step, webinar) })).filter(
    ({ sendAt }) => sendAt.getTime() > now.getTime() - MINUTE,
  );
}

export function isReminderStep(step: string): step is ReminderStep {
  return (REMINDER_STEPS as readonly string[]).includes(step);
}

/**
 * Whether a queued mail still says something true when its time comes, or
 * why it stays unsent: the person cancelled, moved up from the waitlist,
 * the webinar moved (it re-planned its own reminders) or was cancelled.
 */
export function webinarMailDue(
  step: WebinarMailStep,
  state: {
    registration: "pending" | "registered" | "waitlist" | "cancelled";
    webinar: "draft" | "published" | "cancelled";
    /** The start a reminder was planned for, and the start now. */
    plannedFor?: string;
    startsAt: Date;
  },
): "send" | "superseded" | "rescheduled" | "webinar_cancelled" {
  const seated = state.registration === "registered";
  const confirmed = seated || state.registration === "waitlist";
  if (step === "cancelled") {
    return state.webinar === "cancelled" && confirmed ? "send" : "superseded";
  }
  if (step === "registration_cancelled") {
    return state.registration === "cancelled" ? "send" : "superseded";
  }
  if (state.webinar !== "published") return "webinar_cancelled";
  switch (step) {
    case "confirmation":
    case "promoted":
    case "relive_confirmation":
      return seated ? "send" : "superseded";
    case "waitlist":
      return state.registration === "waitlist" ? "send" : "superseded";
    case "rescheduled":
    case "relive":
      return confirmed ? "send" : "superseded";
    default:
      if (!seated) return "superseded";
      return state.plannedFor === state.startsAt.toISOString() ? "send" : "rescheduled";
  }
}
