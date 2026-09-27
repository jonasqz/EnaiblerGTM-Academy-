import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

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

/**
 * Outbound webhooks (brief §10, phase 2): an academy's own endpoints, told
 * about events it picked. Payloads are pseudonymous unless the learner agreed
 * to be contacted (see server/webhooks.ts); every request is signed.
 */
export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    events: text("events").array().notNull(),
    /** HMAC key for the signature header, stored sealed. */
    secretSealed: text("secret_sealed").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
    /** HTTP status or failure reason of the last attempt. */
    lastResult: text("last_result"),
  },
  (table) => [
    unique("webhook_endpoints_tenant_id").on(table.tenantId, table.id),
    tenantIsolation(),
  ],
).enableRLS();

export const webhookDeliveryStatus = pgEnum("webhook_delivery_status", [
  "pending",
  "delivered",
  "failed",
]);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id").notNull(),
    /** The learner it is about: deleting their data deletes what was not sent. */
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: webhookDeliveryStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastResult: text("last_result"),
    createdAt: createdAt(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "webhook_deliveries_endpoint_fk",
      columns: [table.tenantId, table.endpointId],
      foreignColumns: [webhookEndpoints.tenantId, webhookEndpoints.id],
    }).onDelete("cascade"),
    index("webhook_deliveries_due_idx").on(table.tenantId, table.status, table.nextAttemptAt),
    tenantIsolation(),
  ],
).enableRLS();
