import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { session, verification } from "@/db/schema";
import { EXPIRED_SESSION_RETENTION_DAYS, purgeExpiredSignIns } from "@/server/sessions";

import { createUser, hasDatabase, openTestDatabases, type TestDatabases } from "./helpers";

const DAY_MS = 24 * 60 * 60_000;

describe.skipIf(!hasDatabase)("housekeeping for sign-ins", () => {
  let dbs: TestDatabases;
  let userId: string;

  beforeAll(async () => {
    dbs = await openTestDatabases();
    userId = await createUser(dbs.owner.db);
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("deletes sessions after the retention period and links nobody used", async () => {
    const now = new Date();
    const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const sessions = {
      old: ago(EXPIRED_SESSION_RETENTION_DAYS + 1),
      recent: ago(EXPIRED_SESSION_RETENTION_DAYS - 1),
      valid: new Date(now.getTime() + DAY_MS),
    };
    const ids = Object.fromEntries(Object.keys(sessions).map((key) => [key, randomUUID()]));
    // The worker's role: sessions and links are global tables without RLS.
    await dbs.app.db.insert(session).values(
      Object.entries(sessions).map(([key, expiresAt]) => ({
        id: ids[key]!,
        token: randomUUID(),
        expiresAt,
        userId,
        ipAddress: "203.0.113.7",
        userAgent: "Test",
      })),
    );
    const links = { expired: randomUUID(), open: randomUUID() };
    await dbs.app.db.insert(verification).values([
      { id: links.expired, identifier: randomUUID(), value: "x", expiresAt: ago(0.01) },
      {
        id: links.open,
        identifier: randomUUID(),
        value: "x",
        expiresAt: new Date(now.getTime() + 60_000),
      },
    ]);

    const purged = await purgeExpiredSignIns(dbs.app.db, now);
    expect(purged.sessions).toBeGreaterThanOrEqual(1);
    expect(purged.links).toBeGreaterThanOrEqual(1);

    const leftSessions = await dbs.app.db
      .select({ id: session.id })
      .from(session)
      .where(inArray(session.id, Object.values(ids)));
    expect(leftSessions.map((row) => row.id).sort()).toEqual([ids.recent, ids.valid].sort());
    const leftLinks = await dbs.app.db
      .select({ id: verification.id })
      .from(verification)
      .where(inArray(verification.id, Object.values(links)));
    expect(leftLinks.map((row) => row.id)).toEqual([links.open]);
  });
});
