import { lt } from "drizzle-orm";

import type { Database } from "@/db/client";
import { session, verification } from "@/db/schema";

/**
 * How long a session that ran out stays, with the IP address and browser it
 * stores: long enough to look into abuse reported a few weeks later. Signing
 * out deletes a session at once. The privacy policy names this period.
 */
export const EXPIRED_SESSION_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60_000;

/**
 * Deletes sessions that ran out more than the retention period ago and
 * sign-in links nobody used in time. Both tables are global (no academy owns
 * a session row alone), so the worker runs this once, not per academy.
 */
export async function purgeExpiredSignIns(
  db: Database,
  now: Date = new Date(),
): Promise<{ sessions: number; links: number }> {
  const cutoff = new Date(now.getTime() - EXPIRED_SESSION_RETENTION_DAYS * DAY_MS);
  const sessions = await db
    .delete(session)
    .where(lt(session.expiresAt, cutoff))
    .returning({ id: session.id });
  const links = await db
    .delete(verification)
    .where(lt(verification.expiresAt, now))
    .returning({ id: verification.id });
  return { sessions: sessions.length, links: links.length };
}
