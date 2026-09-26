/** Product events (brief §10). Every event also carries tenant, course, path, locale and entry utm_* values. */
export const EVENT_NAMES = [
  "signup_started",
  "signup_completed",
  "course_started",
  "lesson_completed",
  "assignment_submitted",
  "review_completed",
  "review_overridden",
  "review_passed",
  "course_completed",
  "level_up",
  "credential_made_public",
  "credential_shared_linkedin",
  "verification_page_viewed",
  "verification_cta_clicked",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/** Tenant funnel (MVP-light dashboard), in order. */
export const FUNNEL_STEPS = [
  { key: "entry", event: "signup_started" },
  { key: "start", event: "course_started" },
  { key: "submit", event: "assignment_submitted" },
  { key: "pass", event: "review_passed" },
  { key: "public", event: "credential_made_public" },
  { key: "shared", event: "credential_shared_linkedin" },
  { key: "verification_views", event: "verification_page_viewed" },
  { key: "cta_clicks", event: "verification_cta_clicked" },
] as const satisfies ReadonlyArray<{ key: string; event: EventName }>;
