/** Product events (brief §10). Every event also carries tenant, course, path, locale and entry utm_* values. */
export const EVENT_NAMES = [
  "signup_started",
  "signup_completed",
  "course_started",
  "lesson_completed",
  "assignment_submitted",
  "test_submitted",
  "test_passed",
  "review_completed",
  "review_overridden",
  "review_passed",
  "course_completed",
  "level_up",
  "credential_made_public",
  "credential_shared_linkedin",
  "verification_page_viewed",
  "verification_cta_clicked",
  /** A signed-in viewer pressed play on a video for the first time (props: asset_id). */
  "video_started",
  /** Their played ranges covered the academy's threshold, once per video (props: asset_id, percent). */
  "video_watched",
  // Webinars (webinar brief §3): the landing page, the form, the proven address, the session.
  "webinar_page_viewed",
  "webinar_registered",
  "webinar_confirmed",
  "webinar_attended",
  "webinar_registration_cancelled",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/**
 * Tenant funnel (MVP-light dashboard), in order. A step counts several events
 * where courses differ: hand-ins and test attempts are both "submit", and
 * "pass" is the finished course, so passing work and test counts once.
 */
export const FUNNEL_STEPS = [
  { key: "entry", events: ["signup_started"] },
  { key: "start", events: ["course_started"] },
  { key: "submit", events: ["assignment_submitted", "test_submitted"] },
  { key: "pass", events: ["course_completed"] },
  { key: "public", events: ["credential_made_public"] },
  { key: "shared", events: ["credential_shared_linkedin"] },
  { key: "verification_views", events: ["verification_page_viewed"] },
  { key: "cta_clicks", events: ["verification_cta_clicked"] },
] as const satisfies ReadonlyArray<{ key: string; events: readonly EventName[] }>;
