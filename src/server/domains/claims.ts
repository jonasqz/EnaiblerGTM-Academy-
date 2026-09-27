import { randomBytes } from "node:crypto";

import { and, asc, eq, isNotNull } from "drizzle-orm";

import {
  claimExpired,
  evaluateDns,
  MAX_CUSTOM_DOMAINS,
  normalizeCustomDomain,
  type DomainIssue,
} from "@/core/domains/rules";
import type { TenantContext } from "@/core/tenant/context";
import type { Database } from "@/db/client";
import { domainClaims, tenantDomains, tenants } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import type { DnsLookup } from "@/server/domains/dns";
import { clearTenantCache } from "@/server/tenant-resolver";

/*
 * Custom domains from the Studio (brief §11). A claim waits for DNS; a
 * verified one becomes a tenant_domains row, which is what routes and what
 * the proxy config endpoint hands to Traefik for a certificate.
 */

export interface DomainSetup {
  /** Host custom domains point at (CNAME), e.g. acme.academies.enaibler.app. */
  target: string;
  /** Zones that are ours and cannot be claimed. */
  reservedZones: string[];
}

/**
 * Where custom domains should point: CUSTOM_DOMAIN_TARGET, else the academy's
 * own address under ACADEMY_DOMAIN; null when this deployment has neither.
 * Read by name: the worker checks claims too.
 */
export function domainSetup(tenant: Pick<TenantContext, "slug">): DomainSetup | null {
  const academyDomain = process.env.ACADEMY_DOMAIN?.trim().toLowerCase();
  const platformHost = process.env.PLATFORM_HOST?.trim().toLowerCase();
  const target =
    process.env.CUSTOM_DOMAIN_TARGET?.trim().toLowerCase() ||
    (academyDomain ? `${tenant.slug}.${academyDomain}` : undefined);
  if (!target) return null;
  const reservedZones = [academyDomain, platformHost].filter((zone): zone is string =>
    Boolean(zone),
  );
  return { target, reservedZones };
}

export interface StudioDomain {
  domain: string;
  state: "primary" | "active" | "pending" | "failed";
  /** Verified by the academy (removable, gets its certificate via the proxy config). */
  custom: boolean;
  claimId?: string;
  token?: string;
  lastResult?: string | null;
  lastCheckedAt?: Date | null;
  createdAt: Date;
}

export async function listStudioDomains(db: Database, tenantId: string): Promise<StudioDomain[]> {
  const live = await db
    .select()
    .from(tenantDomains)
    .where(eq(tenantDomains.tenantId, tenantId))
    .orderBy(asc(tenantDomains.createdAt));
  const claims = await withTenant(db, tenantId, (tx) =>
    tx.select().from(domainClaims).orderBy(asc(domainClaims.createdAt)),
  );
  return [
    ...live.map((row) => ({
      domain: row.domain,
      state: row.isPrimary ? ("primary" as const) : ("active" as const),
      custom: row.verifiedAt !== null,
      createdAt: row.createdAt,
    })),
    ...claims.map((claim) => ({
      domain: claim.domain,
      state: claim.status,
      custom: true,
      claimId: claim.id,
      token: claim.token,
      lastResult: claim.lastResult,
      lastCheckedAt: claim.lastCheckedAt,
      createdAt: claim.createdAt,
    })),
  ];
}

export type AddDomainResult =
  | { ok: true; claimId: string }
  | { ok: false; error: DomainIssue | "taken" | "limit" | "unavailable" };

export async function addDomainClaim(
  db: Database,
  tenant: TenantContext,
  input: { domain: string; createdBy: string },
): Promise<AddDomainResult> {
  const setup = domainSetup(tenant);
  if (!setup) return { ok: false, error: "unavailable" };
  const normalized = normalizeCustomDomain(input.domain, setup.reservedZones);
  if ("issue" in normalized) return { ok: false, error: normalized.issue };
  const { domain } = normalized;

  const [live] = await db.select().from(tenantDomains).where(eq(tenantDomains.domain, domain));
  if (live) return { ok: false, error: "taken" };
  const custom = (await listStudioDomains(db, tenant.id)).filter((row) => row.custom);
  if (custom.some((row) => row.domain === domain)) {
    const existing = custom.find((row) => row.domain === domain)!;
    return existing.claimId
      ? { ok: true, claimId: existing.claimId }
      : { ok: false, error: "taken" };
  }
  if (custom.length >= MAX_CUSTOM_DOMAINS) return { ok: false, error: "limit" };

  const [claim] = await withTenant(db, tenant.id, (tx) =>
    tx
      .insert(domainClaims)
      .values({
        tenantId: tenant.id,
        domain,
        token: randomBytes(16).toString("hex"),
        createdBy: input.createdBy,
      })
      .returning({ id: domainClaims.id }),
  );
  return { ok: true, claimId: claim!.id };
}

export type CheckResult =
  | { status: "verified"; domain: string }
  | { status: "pending"; missing: Array<"txt" | "routing"> }
  | { status: "failed"; reason: "expired" | "taken" }
  | { status: "gone" };

/** Checks one claim against DNS; a verified claim starts routing right away. */
export async function checkDomainClaim(
  db: Database,
  tenant: Pick<TenantContext, "id" | "slug">,
  claimId: string,
  dns: DnsLookup,
): Promise<CheckResult> {
  const setup = domainSetup(tenant);
  const [claim] = await withTenant(db, tenant.id, (tx) =>
    tx.select().from(domainClaims).where(eq(domainClaims.id, claimId)),
  );
  if (!claim || !setup) return { status: "gone" };
  const now = new Date();
  const record = (status: "pending" | "failed", lastResult: string) =>
    withTenant(db, tenant.id, (tx) =>
      tx
        .update(domainClaims)
        .set({ status, lastResult, lastCheckedAt: now })
        .where(eq(domainClaims.id, claim.id)),
    );

  if (claimExpired(claim.createdAt, now)) {
    await record("failed", "expired");
    return { status: "failed", reason: "expired" };
  }
  const check = evaluateDns(await dns(claim.domain, claim.token, setup.target), {
    token: claim.token,
    target: setup.target,
  });
  if (check.status === "pending") {
    await record("pending", check.missing.join(","));
    return check;
  }

  // Verified: the claim becomes a routing domain, unless someone else's domain row won the race.
  const activated = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(tenantDomains)
      .values({ domain: claim.domain, tenantId: tenant.id, isPrimary: false, verifiedAt: now })
      .onConflictDoNothing()
      .returning({ domain: tenantDomains.domain });
    return inserted.length > 0;
  });
  if (!activated) {
    await record("failed", "taken");
    return { status: "failed", reason: "taken" };
  }
  await withTenant(db, tenant.id, (tx) =>
    tx.delete(domainClaims).where(eq(domainClaims.id, claim.id)),
  );
  clearTenantCache();
  return { status: "verified", domain: claim.domain };
}

/** The worker's round: every open claim of every academy (pending ones until they lapse). */
export async function checkOpenClaims(db: Database, dns: DnsLookup): Promise<number> {
  let verified = 0;
  for (const tenant of await db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.status, "active"))) {
    const open = await withTenant(db, tenant.id, (tx) =>
      tx
        .select({ id: domainClaims.id })
        .from(domainClaims)
        .where(eq(domainClaims.status, "pending")),
    );
    for (const claim of open) {
      const result = await checkDomainClaim(db, tenant, claim.id, dns).catch((error: unknown) => {
        console.error(`[domains] checking a claim of ${tenant.slug} failed`, error);
        return null;
      });
      if (result?.status === "verified") verified++;
    }
  }
  return verified;
}

export async function removeDomain(
  db: Database,
  tenant: TenantContext,
  domain: string,
): Promise<{ ok: true } | { ok: false; error: "primary" | "fixed" }> {
  await withTenant(db, tenant.id, (tx) =>
    tx.delete(domainClaims).where(eq(domainClaims.domain, domain)),
  );
  const [row] = await db
    .select()
    .from(tenantDomains)
    .where(and(eq(tenantDomains.domain, domain), eq(tenantDomains.tenantId, tenant.id)));
  if (!row) return { ok: true };
  if (row.isPrimary) return { ok: false, error: "primary" };
  // The operator's domains (manifest, platform address) stay: they are the fallback.
  if (!row.verifiedAt) return { ok: false, error: "fixed" };
  await db.delete(tenantDomains).where(eq(tenantDomains.domain, domain));
  clearTenantCache();
  return { ok: true };
}

/**
 * Makes a live domain the academy's main address: links in mails and on
 * certificates use it, and the other addresses redirect to it.
 */
export async function makePrimaryDomain(
  db: Database,
  tenant: TenantContext,
  domain: string,
): Promise<boolean> {
  const done = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(tenantDomains)
      .where(and(eq(tenantDomains.domain, domain), eq(tenantDomains.tenantId, tenant.id)));
    if (!row) return false;
    // Clear first: the partial unique index allows one primary per academy.
    await tx
      .update(tenantDomains)
      .set({ isPrimary: false })
      .where(eq(tenantDomains.tenantId, tenant.id));
    await tx.update(tenantDomains).set({ isPrimary: true }).where(eq(tenantDomains.domain, domain));
    return true;
  });
  if (done) clearTenantCache();
  return done;
}

/** Verified custom domains of active academies, for the proxy's certificates. */
export async function certificateDomains(db: Database): Promise<string[]> {
  const rows = await db
    .select({ domain: tenantDomains.domain })
    .from(tenantDomains)
    .innerJoin(tenants, eq(tenants.id, tenantDomains.tenantId))
    .where(and(isNotNull(tenantDomains.verifiedAt), eq(tenants.status, "active")))
    .orderBy(asc(tenantDomains.domain));
  return rows.map((row) => row.domain);
}
