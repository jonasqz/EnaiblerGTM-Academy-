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
  "courses.edit",
  "courses.publish",
  "reviews.decide",
  "people.view",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const GRANTS: Record<MembershipRole, readonly Capability[]> = {
  learner: [],
  // Cohort-scoped mentoring is phase 2.
  mentor: [],
  reviewer: ["studio.view", "reviews.decide", "people.view"],
  // Authors run the review queue for their courses too (brief §8, author tools).
  author: ["studio.view", "courses.edit", "courses.publish", "reviews.decide", "people.view"],
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
