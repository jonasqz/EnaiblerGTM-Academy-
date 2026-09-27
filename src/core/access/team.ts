import { z } from "zod";

import type { MembershipRole } from "@/core/access/roles";

/**
 * The academy's team (brief §4, Membership): everyone with a role besides
 * "learner". Admins manage it in Studio → Settings → Team. Mentors join
 * through a cohort's page instead, because their role is scoped to one.
 */
export const TEAM_ROLES = [
  "tenant_admin",
  "author",
  "reviewer",
  "mentor",
] as const satisfies readonly MembershipRole[];
export type TeamRole = (typeof TEAM_ROLES)[number];

/** Roles the Team page gives and takes: academy-wide, unlike a mentor's. */
export const ACADEMY_ROLES = [
  "tenant_admin",
  "author",
  "reviewer",
] as const satisfies readonly TeamRole[];
export type AcademyRole = (typeof ACADEMY_ROLES)[number];

export function isTeamRole(role: string): role is TeamRole {
  return (TEAM_ROLES as readonly string[]).includes(role);
}

/** The roles ticked in a form: known ones only, each once, in a fixed order. */
export function academyRolesFrom(values: readonly unknown[]): AcademyRole[] {
  return ACADEMY_ROLES.filter((role) => values.includes(role));
}

/** An address as accounts store it (trimmed, lower case), or null when it is not one. */
export function teamEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return email.length <= 254 && z.email().safeParse(email).success ? email : null;
}

export interface RoleChange {
  add: AcademyRole[];
  remove: AcademyRole[];
}

/**
 * What changes when someone's academy-wide roles become `next`. Learner and
 * mentor memberships are never part of it: their learning stays theirs, and
 * mentoring is managed per cohort.
 */
export function roleChange(
  current: readonly MembershipRole[],
  next: readonly AcademyRole[],
): RoleChange {
  return {
    add: ACADEMY_ROLES.filter((role) => next.includes(role) && !current.includes(role)),
    remove: ACADEMY_ROLES.filter((role) => current.includes(role) && !next.includes(role)),
  };
}

/**
 * New roles must leave the person on the team: with no academy-wide role
 * left, only mentoring keeps them there. Taking everything is "remove from
 * the team", a step of its own.
 */
export function keepsTeamRole(
  current: readonly MembershipRole[],
  next: readonly AcademyRole[],
): boolean {
  return next.length > 0 || current.includes("mentor");
}

/**
 * An academy always keeps an admin: without one, nobody can reach its
 * settings or its team again. True when `userId` holds the role alone among
 * `admins` (the current admins' user ids) and would lose it, which covers
 * admins demoting or removing themselves.
 */
export function leavesNoAdmin(
  admins: readonly string[],
  userId: string,
  keepsAdmin: boolean,
): boolean {
  return !keepsAdmin && admins.includes(userId) && admins.every((admin) => admin === userId);
}

/**
 * Invitations an academy may send in 24 hours. Each one is a mail from the
 * academy to an address someone typed in: plenty for a team, too few to be
 * worth abusing.
 */
export const INVITATIONS_PER_DAY = 50;

export function mayInvite(sentInLastDay: number): boolean {
  return sentInLastDay < INVITATIONS_PER_DAY;
}
