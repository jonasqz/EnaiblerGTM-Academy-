import { index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { createdAt, tenantIsolation } from "@/db/schema/_shared";
import { user } from "@/db/schema/auth";
import { tenants } from "@/db/schema/tenancy";

/**
 * API keys an academy creates for its own tools (e.g. importing credentials
 * from the platform it used before). Only a hash is stored; the key is shown
 * once.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** First characters, to tell keys apart in the Studio. */
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    scopes: text("scopes").array().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    unique("api_keys_hash").on(table.keyHash),
    index("api_keys_tenant_idx").on(table.tenantId),
    tenantIsolation(),
  ],
).enableRLS();

/**
 * The academy's key for signing Open Badges 3.0 credentials (VC-JWT, RS256).
 * The public half is published at /issuer/keys/<kid>; the private half is
 * stored sealed (see server/secrets.ts).
 */
export const issuerKeys = pgTable(
  "issuer_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kid: text("kid").notNull(),
    publicJwk: jsonb("public_jwk").$type<Record<string, string>>().notNull(),
    privateKeySealed: text("private_key_sealed").notNull(),
    createdAt: createdAt(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (table) => [unique("issuer_keys_tenant_kid").on(table.tenantId, table.kid), tenantIsolation()],
).enableRLS();
