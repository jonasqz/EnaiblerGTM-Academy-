import {
  bigint,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { UtmKey } from "@/core/entry/context";
import { tenantIsolation } from "@/db/schema/_shared";
import { user } from "@/db/schema/auth";
import { tenants } from "@/db/schema/tenancy";

/**
 * Product events for the tenant funnel (brief §10). Page views go to the
 * cookieless analytics service instead. Deleting a learner keeps their events
 * for aggregate numbers but drops the link to them.
 */
export const events = pgTable(
  "events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    courseId: uuid("course_id"),
    pathId: uuid("path_id"),
    locale: text("locale"),
    utm: jsonb("utm").$type<Partial<Record<UtmKey, string>>>().notNull().default({}),
    props: jsonb("props").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("events_funnel_idx").on(table.tenantId, table.name, table.occurredAt),
    tenantIsolation(),
  ],
).enableRLS();

export const consentKind = pgEnum("consent_kind", ["tenant_marketing", "lead_handoff"]);

/**
 * Marketing only with double opt-in; lead handoff (phase 2) only with its own,
 * separate opt-in (brief §9).
 */
export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: consentKind("kind").notNull(),
    /** Exact wording the learner agreed to, for the record. */
    wording: text("wording").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    confirmTokenHash: text("confirm_token_hash"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    unique("consents_unique").on(table.tenantId, table.userId, table.kind),
    tenantIsolation(),
  ],
).enableRLS();
