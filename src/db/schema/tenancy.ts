import { sql } from "drizzle-orm";
import { boolean, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import type { TenantSettings, Terminology } from "@/core/tenant/manifest";
import type { ThemeInput } from "@/core/theme/schema";
import { createdAt, updatedAt } from "@/db/schema/_shared";

export const tenantStatus = pgEnum("tenant_status", ["active", "suspended"]);

/** Tenant config as stored: the manifest's `tenant` block without slug and domains. */
export type StoredTenantConfig = Omit<TenantSettings, "slug" | "domains">;

/**
 * Tenants and their domains are global (no RLS): the host has to be resolved
 * to a tenant before any tenant context exists.
 */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  status: tenantStatus("status").notNull().default("active"),
  /** Validated with tenantSettingsSchema on write and again on read (defaults for new keys). */
  config: jsonb("config").$type<StoredTenantConfig>().notNull(),
  /** Theme tokens; null means enaibler's default theme. */
  theme: jsonb("theme").$type<ThemeInput>(),
  terminology: jsonb("terminology").$type<Terminology>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const tenantDomains = pgTable(
  "tenant_domains",
  {
    /** Lower-case host name without port. */
    domain: text("domain").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("tenant_domains_primary_idx")
      .on(table.tenantId)
      .where(sql`is_primary`),
  ],
);
