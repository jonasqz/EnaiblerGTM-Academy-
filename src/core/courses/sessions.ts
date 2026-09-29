/**
 * What a series asks of its live sessions (webinar brief §2.7): nothing, or
 * every session the course holds attended live — or, where the authors allow
 * it, watched as a re-live above the academy's threshold within the catch-up
 * window. The Certificate of Completion waits for it like for the work and
 * the test (core/courses/completion).
 */
export const SESSION_RULES = ["none", "attended_or_watched", "attended"] as const;
export type SessionRule = (typeof SESSION_RULES)[number];

export function isSessionRule(value: unknown): value is SessionRule {
  return typeof value === "string" && (SESSION_RULES as readonly string[]).includes(value);
}
