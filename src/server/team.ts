import { randomUUID } from "node:crypto";

import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";

import type { MembershipRole } from "@/core/access/roles";
import {
  ACADEMY_ROLES,
  isTeamRole,
  keepsTeamRole,
  leavesNoAdmin,
  mayInvite,
  roleChange,
  TEAM_ROLES,
  teamEmail,
  type AcademyRole,
  type TeamRole,
} from "@/core/access/team";
import type { Locale } from "@/core/i18n/locales";
import type { TenantContext } from "@/core/tenant/context";
import type { Database, Queryable, Transaction } from "@/db/client";
import { cohorts, learnerProfiles, memberships, notifications, user } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";

/*
 * The academy's team (brief §4, Membership): who works in the Studio, with
 * which roles. Admins invite colleagues in Studio → Settings → Team, and
 * operators grant roles with `npm run role:grant`; both go through this
 * module, so nothing here may depend on Next.js.
 */

/**
 * The account for an address. One that never signed in gets created now, the
 * way sign-up would: one global user per address (brief §4). The magic link
 * proves the address when the person first signs in.
 */
export async function ensureAccount(
  db: Queryable,
  email: string,
): Promise<{ userId: string; created: boolean }> {
  const [inserted] = await db
    .insert(user)
    .values({ id: randomUUID(), name: "", email, emailVerified: false })
    .onConflictDoNothing({ target: user.email })
    .returning({ id: user.id });
  if (inserted) return { userId: inserted.id, created: true };
  const userId = await findAccount(db, email);
  if (!userId) throw new Error("The account for this address disappeared while adding it");
  return { userId, created: false };
}

export async function findAccount(db: Queryable, email: string): Promise<string | null> {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return row?.id ?? null;
}

/** Someone's roles in the academy of the transaction. */
export async function rolesOf(tx: Transaction, userId: string): Promise<MembershipRole[]> {
  const rows = await tx
    .select({ role: memberships.role })
    .from(memberships)
    .where(eq(memberships.userId, userId));
  return rows.map((row) => row.role);
}

/**
 * Who has signed in to this academy: the magic link proved their address,
 * and every sign-in passes /auth/continue, which makes them a learner here.
 * (Accounts created by an invitation or a credential import have neither.)
 */
async function signedInHere(tx: Transaction, userIds: readonly string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await tx
    .select({ userId: memberships.userId })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(
      and(
        eq(memberships.role, "learner"),
        eq(user.emailVerified, true),
        inArray(memberships.userId, [...userIds]),
      ),
    );
  return new Set(rows.map((row) => row.userId));
}

export interface TeamMember {
  userId: string;
  email: string;
  /** The account's name, else the one on their academy profile, when they gave one. */
  name: string | null;
  /** Academy-wide roles: what the Team page changes. */
  roles: AcademyRole[];
  /** Cohorts they mentor; an empty list is a mentor role without a cohort. */
  mentorOf: string[] | null;
  signedIn: boolean;
  /** When the latest invitation to them was written. */
  invitedAt: Date | null;
}

/** Everyone with a team role, by address. Learners are not the team, whatever else they do. */
export async function listTeam(db: Database, tenantId: string): Promise<TeamMember[]> {
  return withTenant(db, tenantId, async (tx) => {
    const rows = await tx
      .select({
        userId: memberships.userId,
        role: memberships.role,
        cohortName: cohorts.name,
        email: user.email,
        name: user.name,
      })
      .from(memberships)
      .innerJoin(user, eq(user.id, memberships.userId))
      .leftJoin(cohorts, eq(cohorts.id, memberships.cohortId))
      .where(inArray(memberships.role, [...TEAM_ROLES]))
      .orderBy(asc(user.email), asc(cohorts.name));
    const userIds = [...new Set(rows.map((row) => row.userId))];
    if (userIds.length === 0) return [];

    const signedIn = await signedInHere(tx, userIds);
    const profiles = await tx
      .select({ userId: learnerProfiles.userId, displayName: learnerProfiles.displayName })
      .from(learnerProfiles)
      .where(inArray(learnerProfiles.userId, userIds));
    const invitations = await tx
      .select({
        userId: notifications.userId,
        at: sql<Date>`max(${notifications.createdAt})`.mapWith((value) => new Date(value)),
      })
      .from(notifications)
      .where(and(eq(notifications.kind, "team_invite"), inArray(notifications.userId, userIds)))
      .groupBy(notifications.userId);

    return userIds.map((userId): TeamMember => {
      const own = rows.filter((row) => row.userId === userId);
      const first = own[0]!;
      const mentoring = own.filter((row) => row.role === "mentor");
      const profileName = profiles.find((profile) => profile.userId === userId)?.displayName;
      return {
        userId,
        email: first.email,
        name: first.name.trim() || profileName?.trim() || null,
        roles: ACADEMY_ROLES.filter((role) => own.some((row) => row.role === role)),
        mentorOf:
          mentoring.length > 0
            ? mentoring.flatMap((row) => (row.cohortName ? [row.cohortName] : []))
            : null,
        signedIn: signedIn.has(userId),
        invitedAt: invitations.find((invitation) => invitation.userId === userId)?.at ?? null,
      };
    });
  });
}

export type TeamError =
  "email" | "no_roles" | "limit" | "last_admin" | "not_found" | "forbidden" | "signed_in";

export type TeamResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: TeamError };

/**
 * The admins, locked until the transaction ends. Every change to the team
 * takes this lock first, so two admins taking the role from each other at
 * the same moment cannot both succeed, and the second one sees the first
 * one's change.
 */
async function lockedAdmins(tx: Transaction): Promise<string[]> {
  const rows = await tx
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.role, "tenant_admin"))
    .for("update");
  return rows.map((row) => row.userId);
}

/** Sets someone's academy-wide roles; learning and mentoring stay as they are. */
async function applyAcademyRoles(
  tx: Transaction,
  tenantId: string,
  userId: string,
  current: readonly MembershipRole[],
  next: readonly AcademyRole[],
): Promise<void> {
  const change = roleChange(current, next);
  if (change.remove.length > 0) {
    await tx
      .delete(memberships)
      .where(and(eq(memberships.userId, userId), inArray(memberships.role, change.remove)));
  }
  if (change.add.length > 0) {
    await tx
      .insert(memberships)
      .values(change.add.map((role) => ({ tenantId, userId, role })))
      .onConflictDoNothing();
  }
}

async function invitationsInLastDay(tx: Transaction): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.kind, "team_invite"),
        gt(notifications.createdAt, sql`now() - interval '24 hours'`),
      ),
    );
  return row?.n ?? 0;
}

/**
 * The invitation mail, sent by the worker like all transactional mail. It is
 * written in `locale` and names the roles the person has when it goes out.
 */
async function queueInvitation(
  tx: Transaction,
  tenantId: string,
  userId: string,
  locale: Locale,
): Promise<void> {
  await tx.insert(notifications).values({
    tenantId,
    userId,
    kind: "team_invite",
    payload: { locale },
  });
}

export interface InviteInput {
  /** The admin who invites: only admins change the team. */
  actorId: string;
  email: string;
  roles: readonly AcademyRole[];
  /** The admin's Studio language, which the invitation is written in. */
  locale: Locale;
}

/**
 * Adds someone to the team by e-mail and mails them an invitation. Someone
 * already on the team just gets the roles, without another mail.
 */
export async function inviteToTeam(
  db: Database,
  tenant: TenantContext,
  input: InviteInput,
): Promise<TeamResult<{ status: "invited" | "updated"; email: string }>> {
  const email = teamEmail(input.email);
  if (!email) return { ok: false, error: "email" };
  if (input.roles.length === 0) return { ok: false, error: "no_roles" };
  return withTenant(db, tenant.id, async (tx) => {
    const admins = await lockedAdmins(tx);
    if (!admins.includes(input.actorId)) return { ok: false, error: "forbidden" };
    // Every refusal comes before the first write: a refused invitation leaves no account behind.
    const existing = await findAccount(tx, email);
    const current = existing ? await rolesOf(tx, existing) : [];
    const onTeam = current.some(isTeamRole);
    if (existing && leavesNoAdmin(admins, existing, input.roles.includes("tenant_admin"))) {
      return { ok: false, error: "last_admin" };
    }
    if (!onTeam && !mayInvite(await invitationsInLastDay(tx))) {
      return { ok: false, error: "limit" };
    }
    const userId = existing ?? (await ensureAccount(tx, email)).userId;
    await applyAcademyRoles(tx, tenant.id, userId, current, input.roles);
    if (onTeam) return { ok: true, status: "updated", email };
    await queueInvitation(tx, tenant.id, userId, input.locale);
    return { ok: true, status: "invited", email };
  });
}

/** New academy-wide roles for someone on the team. */
export async function changeTeamRoles(
  db: Database,
  tenant: TenantContext,
  input: { actorId: string; userId: string; roles: readonly AcademyRole[] },
): Promise<TeamResult> {
  return withTenant(db, tenant.id, async (tx) => {
    const admins = await lockedAdmins(tx);
    if (!admins.includes(input.actorId)) return { ok: false, error: "forbidden" };
    const current = await rolesOf(tx, input.userId);
    if (!current.some(isTeamRole)) return { ok: false, error: "not_found" };
    if (!keepsTeamRole(current, input.roles)) return { ok: false, error: "no_roles" };
    if (leavesNoAdmin(admins, input.userId, input.roles.includes("tenant_admin"))) {
      return { ok: false, error: "last_admin" };
    }
    await applyAcademyRoles(tx, tenant.id, input.userId, current, input.roles);
    return { ok: true };
  });
}

/**
 * Takes every team role, mentoring included. The person stays a learner if
 * they are one, with everything they learned and handed in.
 */
export async function removeFromTeam(
  db: Database,
  tenant: TenantContext,
  input: { actorId: string; userId: string },
): Promise<TeamResult> {
  return withTenant(db, tenant.id, async (tx) => {
    const admins = await lockedAdmins(tx);
    if (!admins.includes(input.actorId)) return { ok: false, error: "forbidden" };
    const current = await rolesOf(tx, input.userId);
    if (!current.some(isTeamRole)) return { ok: false, error: "not_found" };
    if (leavesNoAdmin(admins, input.userId, false)) return { ok: false, error: "last_admin" };
    await tx
      .delete(memberships)
      .where(and(eq(memberships.userId, input.userId), inArray(memberships.role, [...TEAM_ROLES])));
    return { ok: true };
  });
}

/** Another invitation for someone who has not signed in yet (the first one got lost). */
export async function resendInvitation(
  db: Database,
  tenant: TenantContext,
  input: { actorId: string; userId: string; locale: Locale },
): Promise<TeamResult> {
  return withTenant(db, tenant.id, async (tx) => {
    const admins = await lockedAdmins(tx);
    if (!admins.includes(input.actorId)) return { ok: false, error: "forbidden" };
    const current = await rolesOf(tx, input.userId);
    if (!current.some(isTeamRole)) return { ok: false, error: "not_found" };
    if ((await signedInHere(tx, [input.userId])).size > 0) {
      return { ok: false, error: "signed_in" };
    }
    if (!mayInvite(await invitationsInLastDay(tx))) return { ok: false, error: "limit" };
    await queueInvitation(tx, tenant.id, input.userId, input.locale);
    return { ok: true };
  });
}

/**
 * One role, for operators (`npm run role:grant`): no mail. A mentor granted
 * this way belongs to no cohort until one adds them.
 */
export async function grantRole(
  db: Database,
  tenantId: string,
  userId: string,
  role: TeamRole,
): Promise<void> {
  await withTenant(db, tenantId, (tx) =>
    tx.insert(memberships).values({ tenantId, userId, role }).onConflictDoNothing(),
  );
}

/** Takes one role away, except from the academy's last admin. */
export async function revokeRole(
  db: Database,
  tenantId: string,
  userId: string,
  role: TeamRole,
): Promise<TeamResult> {
  return withTenant(db, tenantId, async (tx) => {
    const admins = await lockedAdmins(tx);
    if (role === "tenant_admin" && leavesNoAdmin(admins, userId, false)) {
      return { ok: false, error: "last_admin" };
    }
    await tx
      .delete(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.role, role)));
    return { ok: true };
  });
}

/** Team members with their roles who have signed in here: who review alerts may go to. */
export async function signedInTeam(
  tx: Transaction,
): Promise<Array<{ userId: string; roles: MembershipRole[] }>> {
  const rows = await tx
    .select({ userId: memberships.userId, role: memberships.role })
    .from(memberships)
    .where(inArray(memberships.role, [...TEAM_ROLES]));
  const userIds = [...new Set(rows.map((row) => row.userId))];
  const signedIn = await signedInHere(tx, userIds);
  return userIds
    .filter((userId) => signedIn.has(userId))
    .map((userId) => ({
      userId,
      roles: rows.filter((row) => row.userId === userId).map((row) => row.role),
    }));
}
