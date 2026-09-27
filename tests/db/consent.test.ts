import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TenantContext } from "@/core/tenant/context";
import { consents } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import {
  confirmMarketingConsent,
  countContacts,
  listContacts,
  loadMarketingConsent,
  marketingLinkValid,
  requestMarketingConsent,
  withdrawMarketingConsent,
} from "@/server/consent";
import { setContactOptIn, setDisplayName } from "@/server/profile";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

const WORDING = "Yes, send me news and offers by email. I can unsubscribe at any time.";

describe.skipIf(!hasDatabase)("marketing consent: double opt-in", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let other: TenantContext;
  let learner: string;

  beforeAll(async () => {
    dbs = await openTestDatabases();
    tenant = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    other = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    learner = await createUser(dbs.owner.db);
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("counts nobody until the mailed link is clicked", async () => {
    const request = await requestMarketingConsent(dbs.app.db, tenant.id, learner, WORDING);
    expect(request.status).toBe("confirmation_needed");
    const token = request.status === "confirmation_needed" ? request.token : "";
    expect((await loadMarketingConsent(dbs.app.db, tenant.id, learner)).state).toBe("pending");
    expect(await listContacts(dbs.app.db, tenant.id, "tenant_marketing")).toEqual([]);

    // Pressing the button again right away sends no second mail.
    expect(await requestMarketingConsent(dbs.app.db, tenant.id, learner, WORDING)).toEqual({
      status: "recently_sent",
    });

    // The token is stored hashed and works only in its own academy.
    const [row] = await withTenant(dbs.app.db, tenant.id, (tx) => tx.select().from(consents));
    expect(row!.confirmTokenHash).not.toContain(token);
    expect(await confirmMarketingConsent(dbs.app.db, other.id, token)).toBe(false);
    expect(await confirmMarketingConsent(dbs.app.db, tenant.id, "not-the-token")).toBe(false);

    expect(await marketingLinkValid(dbs.app.db, tenant.id, token)).toBe(true);
    expect(await confirmMarketingConsent(dbs.app.db, tenant.id, token)).toBe(true);
    // Single use.
    expect(await confirmMarketingConsent(dbs.app.db, tenant.id, token)).toBe(false);

    await setDisplayName(dbs.app.db, tenant, learner, "=cmd|' /C calc'!A0");
    const [contact] = await listContacts(dbs.app.db, tenant.id, "tenant_marketing");
    expect(contact).toMatchObject({
      email: `${learner}@learners.test`,
      wording: WORDING,
      name: "=cmd|' /C calc'!A0",
    });
    expect(await countContacts(dbs.app.db, tenant.id)).toEqual({
      tenant_marketing: 1,
      lead_handoff: 0,
    });
    expect(await requestMarketingConsent(dbs.app.db, tenant.id, learner, WORDING)).toEqual({
      status: "already_confirmed",
    });
  });

  it("drops a learner from the list the moment they unsubscribe", async () => {
    await withdrawMarketingConsent(dbs.app.db, tenant.id, learner);
    expect((await loadMarketingConsent(dbs.app.db, tenant.id, learner)).state).toBe("revoked");
    expect(await listContacts(dbs.app.db, tenant.id, "tenant_marketing")).toEqual([]);
  });

  it("lets confirmation links expire after a week", async () => {
    const request = await requestMarketingConsent(dbs.app.db, tenant.id, learner, WORDING);
    const token = request.status === "confirmation_needed" ? request.token : "";
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .update(consents)
        .set({ requestedAt: sql`now() - interval '8 days'` })
        .where(eq(consents.userId, learner)),
    );
    expect((await loadMarketingConsent(dbs.app.db, tenant.id, learner)).state).toBe("expired");
    expect(await confirmMarketingConsent(dbs.app.db, tenant.id, token)).toBe(false);
  });

  it("keeps the contact list separate from newsletter consent", async () => {
    const colleague = await createUser(dbs.owner.db);
    await setContactOptIn(dbs.app.db, tenant, colleague, true, "The academy may contact me.");
    expect(
      (await listContacts(dbs.app.db, tenant.id, "lead_handoff")).map((row) => row.email),
    ).toEqual([`${colleague}@learners.test`]);
    expect(await listContacts(dbs.app.db, tenant.id, "tenant_marketing")).toEqual([]);
  });
});
