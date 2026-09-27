import type { WEBHOOK_EVENT_GROUPS, WebhookEvent } from "@/core/webhooks/events";

export const WEBHOOK_GROUP_LABELS: Record<keyof typeof WEBHOOK_EVENT_GROUPS, string> = {
  learning: "Learning",
  credentials: "Certificates",
  consent: "Consent",
};

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  signup_completed: "Signed up",
  course_started: "Started a course",
  lesson_completed: "Completed a lesson",
  assignment_submitted: "Handed in an assignment",
  review_completed: "Review finished",
  review_passed: "Passed an assignment",
  review_overridden: "Result changed by a reviewer",
  course_completed: "Completed a course",
  level_up: "Reached a level",
  credential_made_public: "Made a certificate public",
  credential_shared_linkedin: "Shared a certificate on LinkedIn",
  verification_cta_clicked: "Visitor clicked the call to action on a certificate",
  marketing_consent_confirmed: "Confirmed the newsletter",
  marketing_consent_withdrawn: "Unsubscribed from the newsletter",
  contact_consent_given: "Agreed to be contacted",
  contact_consent_withdrawn: "Withdrew consent to be contacted",
  ping: "Test event",
};

/** What the receiving side answered (see server/webhooks.ts). */
export function describeWebhookResult(result: string | null): string {
  if (!result) return "Waiting";
  if (result === "blocked") return "Blocked: the address is not public";
  if (result === "unreachable") return "Could not connect";
  if (result === "paused") return "Not sent: the webhook was paused";
  const code = Number(result);
  if (code >= 200 && code < 300) return `Delivered (${code})`;
  return `Answered ${result}`;
}
