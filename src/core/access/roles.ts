/**
 * Roles are per academy (brief §4, Membership). Capabilities decide what the
 * Studio shows and what its actions allow; pages and actions both check them.
 */
export const MEMBERSHIP_ROLES = [
  "learner",
  "author",
  "reviewer",
  "mentor",
  "tenant_admin",
] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const CAPABILITIES = [
  "studio.view",
  /** The course list and course pages (read); editing needs courses.edit. */
  "courses.view",
  "courses.edit",
  "courses.publish",
  "reviews.decide",
  "people.view",
  /** Academy settings: name, languages, legal pages, brand. */
  "academy.manage",
  /** E-mail addresses of learners who agreed to hear from the academy. */
  "contacts.export",
  /** Create cohorts, share their join links, assign mentors. */
  "cohorts.manage",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const GRANTS: Record<MembershipRole, readonly Capability[]> = {
  learner: [],
  // Mentors review, but only the work of their cohorts (see reviewsLimitedToCohorts).
  mentor: ["studio.view", "reviews.decide"],
  reviewer: ["studio.view", "courses.view", "reviews.decide", "people.view"],
  // Authors run the review queue for their courses too (brief §8, author tools).
  author: [
    "studio.view",
    "courses.view",
    "courses.edit",
    "courses.publish",
    "reviews.decide",
    "people.view",
    "cohorts.manage",
  ],
  tenant_admin: CAPABILITIES,
};

export function capabilitiesOf(roles: readonly MembershipRole[]): Set<Capability> {
  return new Set(roles.flatMap((role) => GRANTS[role]));
}

export function can(roles: readonly MembershipRole[], capability: Capability): boolean {
  return capabilitiesOf(roles).has(capability);
}

export function isMembershipRole(value: unknown): value is MembershipRole {
  return typeof value === "string" && (MEMBERSHIP_ROLES as readonly string[]).includes(value);
}

/**
 * Mentors are cohort-scoped (brief §4, Membership): someone whose only
 * reviewing role is "mentor" sees and decides the work of their cohorts'
 * learners, nothing else.
 */
export function reviewsLimitedToCohorts(roles: readonly MembershipRole[]): boolean {
  return (
    roles.includes("mentor") &&
    !roles.some((role) => role === "reviewer" || role === "author" || role === "tenant_admin")
  );
}
