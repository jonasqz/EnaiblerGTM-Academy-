import { sql } from "drizzle-orm";

import type { Database, Transaction } from "@/db/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The tenant-scoped query helper (brief §11). Every query on tenant data runs
 * inside this transaction; `app.tenant_id` is set transaction-locally, so it
 * can never leak to the next user of a pooled connection, and the RLS
 * policies only let rows of this tenant through.
 */
export async function withTenant<T>(
  db: Database,
  tenantId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  assertTenantId(tenantId);
  return db.transaction(async (tx) => {
    await setTenantContext(tx, tenantId);
    return fn(tx);
  });
}

/** Switches an open transaction to a tenant; prefer `withTenant` unless the transaction already exists. */
export async function setTenantContext(tx: Transaction, tenantId: string): Promise<void> {
  assertTenantId(tenantId);
  await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
}

function assertTenantId(tenantId: string): void {
  if (!UUID.test(tenantId)) throw new Error(`Invalid tenant id: ${tenantId}`);
}

/**
 * Cross-academy, read-only context for one user's own rows (currently: their
 * memberships). Used where a learner acts on their global account, e.g.
 * deleting it only once no academy is left. Never combine with withTenant.
 */
export async function withUser<T>(
  db: Database,
  userId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  if (!userId || userId.length > 200) throw new Error("Invalid user id");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}
