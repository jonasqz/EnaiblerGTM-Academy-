import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withTenant } from "@/db/tenant-scope";
import { trackEvent } from "@/server/events";
import { loadFunnel } from "@/server/funnel";

import { createTenant, hasDatabase, openTestDatabases, type TestDatabases } from "./helpers";

describe.skipIf(!hasDatabase)("tenant funnel", () => {
  let dbs: TestDatabases;
  let tenant: string;
  let otherTenant: string;

  beforeAll(async () => {
    dbs = await openTestDatabases();
    tenant = await createTenant(dbs.owner.db);
    otherTenant = await createTenant(dbs.owner.db);
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("counts funnel events of this academy only, in order", async () => {
    await withTenant(dbs.app.db, tenant, async (tx) => {
      for (const name of [
        "signup_started",
        "signup_started",
        "course_started",
        "review_passed",
        "lesson_completed",
      ] as const) {
        await trackEvent(tx, { tenantId: tenant, name, entry: { utm: { source: "newsletter" } } });
      }
    });
    await withTenant(dbs.app.db, otherTenant, (tx) =>
      trackEvent(tx, { tenantId: otherTenant, name: "signup_started" }),
    );

    const window = { from: new Date(Date.now() - 60_000), to: new Date(Date.now() + 60_000) };
    const funnel = await withTenant(dbs.app.db, tenant, (tx) => loadFunnel(tx, window));
    expect(funnel.map((step) => [step.key, step.count])).toEqual([
      ["entry", 2],
      ["start", 1],
      ["submit", 0],
      ["pass", 1],
      ["public", 0],
      ["shared", 0],
      ["verification_views", 0],
      ["cta_clicks", 0],
    ]);
  });
});
