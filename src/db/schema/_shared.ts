import { sql } from "drizzle-orm";
import { pgPolicy, timestamp } from "drizzle-orm/pg-core";

/**
 * Tenant id of the current transaction, set by `withTenant()` via
 * `set_config('app.tenant_id', …, true)`. NULLIF: on a pooled connection that
 * once had the setting, it reads back as '' (not NULL) after the transaction.
 */
export const currentTenantId = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`;

/** User id of the current transaction, set only by `withUser()` (see db/tenant-scope.ts). */
export const currentUserId = sql`nullif(current_setting('app.user_id', true), '')`;

/**
 * Row-level security for tenant-scoped tables (defence in depth, brief §11):
 * rows are only visible and writable inside the matching tenant context, and
 * with no context nothing is visible. FORCE ROW LEVEL SECURITY is applied in
 * a custom migration so the table owner is bound too (drizzle-kit cannot emit it).
 */
export const tenantIsolation = () =>
  pgPolicy("tenant_isolation", {
    as: "permissive",
    for: "all",
    using: sql`tenant_id = ${currentTenantId}`,
    withCheck: sql`tenant_id = ${currentTenantId}`,
  });

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
