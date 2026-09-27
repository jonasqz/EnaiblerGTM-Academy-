import { pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { createdAt, tenantIsolation } from "@/db/schema/_shared";
import { user } from "@/db/schema/auth";
import { tenants } from "@/db/schema/tenancy";

export const domainClaimStatus = pgEnum("domain_claim_status", ["pending", "failed"]);

/**
 * A custom domain an academy asked for and has not proven yet (see
 * core/domains/rules.ts). Once DNS checks out it moves to tenant_domains,
 * which is what routes; a claim never does.
 */
export const domainClaims = pgTable(
  "domain_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    /** Goes into the TXT record; per claim, so nobody can reuse another academy's. */
    token: text("token").notNull(),
    status: domainClaimStatus("status").notNull().default("pending"),
    /** What DNS still lacks ("txt", "routing") or why the claim failed. */
    lastResult: text("last_result"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("domain_claims_tenant_domain").on(table.tenantId, table.domain),
    tenantIsolation(),
  ],
).enableRLS();
