import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DnsAnswers } from "@/core/domains/rules";
import type { TenantContext } from "@/core/tenant/context";
import { domainClaims, tenantDomains } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantByDomain, findTenantById } from "@/db/tenants";
import {
  addDomainClaim,
  certificateDomains,
  checkDomainClaim,
  checkOpenClaims,
  listStudioDomains,
  makePrimaryDomain,
  removeDomain,
} from "@/server/domains/claims";
import type { DnsLookup } from "@/server/domains/dns";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  uniqueSlug,
  type TestDatabases,
} from "./helpers";

describe.skipIf(!hasDatabase)("custom domains", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let other: TenantContext;
  let admin: string;
  const domain = `${uniqueSlug("learn")}.acme-example.com`;
  /** DNS as the academy set it up so far. */
  let answers: DnsAnswers = {
    txt: [],
    cname: [],
    addresses: [],
    targetAddresses: ["203.0.113.10"],
  };
  const dns: DnsLookup = async () => answers;

  beforeAll(async () => {
    process.env.ACADEMY_DOMAIN = "academies.test";
    delete process.env.CUSTOM_DOMAIN_TARGET;
    dbs = await openTestDatabases();
    tenant = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    other = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    admin = await createUser(dbs.owner.db);
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("refuses our own zones and addresses already in use", async () => {
    expect(
      await addDomainClaim(dbs.app.db, tenant, {
        domain: `x.academies.test`,
        createdBy: admin,
      }),
    ).toEqual({ ok: false, error: "reserved" });
    // Test academies live under .test, which is never a custom domain.
    expect(
      await addDomainClaim(dbs.app.db, tenant, { domain: other.primaryDomain, createdBy: admin }),
    ).toEqual({ ok: false, error: "reserved" });
    const taken = `taken.${domain}`;
    await dbs.owner.db.insert(tenantDomains).values({ domain: taken, tenantId: other.id });
    expect(await addDomainClaim(dbs.app.db, tenant, { domain: taken, createdBy: admin })).toEqual({
      ok: false,
      error: "taken",
    });
  });

  it("routes a domain only after DNS proves control and points at the academy", async () => {
    const added = await addDomainClaim(dbs.app.db, tenant, {
      domain: `https://${domain.toUpperCase()}/`,
      createdBy: admin,
    });
    expect(added.ok).toBe(true);
    const claimId = added.ok ? added.claimId : "";
    // Another academy may claim it too; only the TXT token decides.
    const rival = await addDomainClaim(dbs.app.db, other, { domain, createdBy: admin });
    expect(rival.ok).toBe(true);

    expect(await checkDomainClaim(dbs.app.db, tenant, claimId, dns)).toEqual({
      status: "pending",
      missing: ["txt", "routing"],
    });
    expect(await findTenantByDomain(dbs.app.db, domain)).toBeNull();

    const [claim] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(domainClaims).where(eq(domainClaims.id, claimId)),
    );
    answers = {
      ...answers,
      txt: [`enaibler-verification=${claim!.token}`],
      cname: [`${tenant.slug}.academies.test.`],
    };
    // The worker's round finds it.
    expect(await checkOpenClaims(dbs.app.db, dns)).toBe(1);
    expect((await findTenantByDomain(dbs.app.db, domain))?.id).toBe(tenant.id);
    expect(await certificateDomains(dbs.app.db)).toContain(domain);

    // The rival's token is not in DNS, and the domain is taken now anyway.
    const rivalId = rival.ok ? rival.claimId : "";
    expect(await checkDomainClaim(dbs.app.db, other, rivalId, dns)).toMatchObject({
      status: "pending",
    });
    const [rivalClaim] = await withTenant(dbs.app.db, other.id, (tx) =>
      tx.select().from(domainClaims),
    );
    answers = { ...answers, txt: [`enaibler-verification=${rivalClaim!.token}`] };
    answers = { ...answers, cname: [`${other.slug}.academies.test`] };
    expect(await checkDomainClaim(dbs.app.db, other, rivalId, dns)).toEqual({
      status: "failed",
      reason: "taken",
    });
  });

  it("switches the main address and keeps the operator's addresses", async () => {
    expect(await makePrimaryDomain(dbs.app.db, tenant, domain)).toBe(true);
    const moved = (await findTenantById(dbs.app.db, tenant.id))!;
    expect(moved.primaryDomain).toBe(domain);
    expect(moved.settings.domains).toEqual([domain, tenant.primaryDomain]);

    expect(await removeDomain(dbs.app.db, moved, domain)).toEqual({ ok: false, error: "primary" });
    expect(await removeDomain(dbs.app.db, moved, tenant.primaryDomain)).toEqual({
      ok: false,
      error: "fixed",
    });
    expect(await makePrimaryDomain(dbs.app.db, moved, tenant.primaryDomain)).toBe(true);
    expect(await removeDomain(dbs.app.db, moved, domain)).toEqual({ ok: true });
    expect(await findTenantByDomain(dbs.app.db, domain)).toBeNull();
    expect(await certificateDomains(dbs.app.db)).not.toContain(domain);
  });

  it("lets unverified claims lapse after a week", async () => {
    const added = await addDomainClaim(dbs.app.db, tenant, {
      domain: `late.${domain}`,
      createdBy: admin,
    });
    const claimId = added.ok ? added.claimId : "";
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .update(domainClaims)
        .set({ createdAt: sql`now() - interval '8 days'` })
        .where(eq(domainClaims.id, claimId)),
    );
    expect(await checkDomainClaim(dbs.app.db, tenant, claimId, dns)).toEqual({
      status: "failed",
      reason: "expired",
    });
    const rows = await listStudioDomains(dbs.app.db, tenant.id);
    expect(rows.find((row) => row.claimId === claimId)).toMatchObject({
      state: "failed",
      lastResult: "expired",
    });
  });
});
