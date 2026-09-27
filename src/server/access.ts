import "server-only";

import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { can, type Capability, type MembershipRole } from "@/core/access/roles";
import type { TenantContext } from "@/core/tenant/context";
import { getDb } from "@/db/client";
import { memberships } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { getViewer, type Viewer } from "@/server/auth";
import { getTenant } from "@/server/request";

export async function loadRoles(tenant: TenantContext, userId: string): Promise<MembershipRole[]> {
  const rows = await withTenant(getDb(), tenant.id, (tx) =>
    tx.select({ role: memberships.role }).from(memberships).where(eq(memberships.userId, userId)),
  );
  return rows.map((row) => row.role);
}

export interface Session {
  tenant: TenantContext;
  viewer: Viewer;
  roles: MembershipRole[];
}

/** The signed-in viewer of this academy with their roles, or null. Cached per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const tenant = await getTenant();
  const viewer = await getViewer(tenant);
  if (!viewer) return null;
  return { tenant, viewer, roles: await loadRoles(tenant, viewer.userId) };
});

/**
 * Guard for Studio pages and actions. Not signed in: go through sign-in and
 * come back. Signed in without the capability: the Studio does not exist.
 */
export async function requireCapability(
  capability: Capability,
  next = "/studio",
): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (!can(session.roles, capability)) notFound();
  return session;
}

/** Guard for learner pages that need a signed-in learner (e.g. /me). */
export async function requireViewer(next: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return session;
}
