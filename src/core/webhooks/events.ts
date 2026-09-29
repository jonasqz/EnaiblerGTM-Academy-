import { EVENT_NAMES, type EventName } from "@/core/events/names";

/**
 * What an academy can be told about (brief §10, phase 2 webhooks). Page
 * views and sign-up starts stay in analytics; consent changes are here so a
 * newsletter tool or CRM can follow them.
 */
export const CONSENT_EVENTS = [
  "marketing_consent_confirmed",
  "marketing_consent_withdrawn",
  "contact_consent_given",
  "contact_consent_withdrawn",
] as const;

type QuietEvent = "signup_started" | "verification_page_viewed" | "webinar_page_viewed";
const QUIET: readonly string[] = [
  "signup_started",
  "verification_page_viewed",
  "webinar_page_viewed",
] satisfies QuietEvent[];

type ReportedEvent = Exclude<EventName, QuietEvent> | (typeof CONSENT_EVENTS)[number];

export const WEBHOOK_EVENTS: readonly ReportedEvent[] = [
  ...EVENT_NAMES.filter((name): name is Exclude<EventName, QuietEvent> => !QUIET.includes(name)),
  ...CONSENT_EVENTS,
];
export type WebhookEvent = ReportedEvent | "ping";

/** How the Studio lists them: what learners do, what happens to their credentials, consent. */
export const WEBHOOK_EVENT_GROUPS = {
  learning: [
    "signup_completed",
    "course_started",
    "lesson_completed",
    "assignment_submitted",
    "test_submitted",
    "test_passed",
    "review_completed",
    "review_passed",
    "review_overridden",
    "course_completed",
    "level_up",
  ],
  credentials: ["credential_made_public", "credential_shared_linkedin", "verification_cta_clicked"],
  // Lead signals (webinar brief §3): named only with the learner's consent to be contacted.
  webinars: [
    "webinar_registered",
    "webinar_confirmed",
    "webinar_attended",
    "webinar_registration_cancelled",
  ],
  consent: CONSENT_EVENTS,
} as const satisfies Record<string, readonly ReportedEvent[]>;

export function isWebhookEvent(name: string): name is WebhookEvent {
  return name === "ping" || (WEBHOOK_EVENTS as readonly string[]).includes(name);
}

/** Consent events carry the address they are about; the rest only with lead-handoff consent. */
export function carriesEmail(event: WebhookEvent, contactConsent: boolean): boolean {
  return (CONSENT_EVENTS as readonly string[]).includes(event) || contactConsent;
}

export const MAX_DELIVERY_ATTEMPTS = 8;

/** Per academy: enough for a CRM, a newsletter tool and an automation service or two. */
export const MAX_WEBHOOKS = 10;

/** Backoff between attempts: 1 and 5 minutes, half an hour, then 2, 6, 12 and 24 hours. */
export function nextAttemptDelayMinutes(attempts: number): number {
  const steps = [1, 5, 30, 120, 360, 720, 1440];
  return steps[Math.min(Math.max(attempts, 1), steps.length) - 1]!;
}

/** Endpoints must be https in production (no secrets or learner data in the clear). */
export function webhookUrlIssue(
  input: string,
  options: { allowHttp: boolean },
): "invalid" | "https" | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return "invalid";
  }
  if (url.username || url.password || !url.hostname.includes(".")) return "invalid";
  if (url.protocol === "https:") return null;
  return url.protocol === "http:" && options.allowHttp ? null : "https";
}
