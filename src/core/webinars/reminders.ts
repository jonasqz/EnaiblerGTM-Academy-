import { webinarEnd, type WebinarTimes } from "@/core/webinars/phase";

/**
 * The mails around a webinar (webinar brief §3, reminder sequence). The
 * confirmation goes out when the address is proven; the rest is planned
 * from the webinar's time and re-planned when it moves.
 */
export const REMINDER_STEPS = ["reminder_24h", "reminder_1h", "starting", "followup"] as const;
export type ReminderStep = (typeof REMINDER_STEPS)[number];

/** Every mail a registrant can get, for the outbox payload. */
export const WEBINAR_MAIL_STEPS = [
  "confirmation",
  "waitlist",
  "promoted",
  ...REMINDER_STEPS,
  "rescheduled",
  "cancelled",
  "registration_cancelled",
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
