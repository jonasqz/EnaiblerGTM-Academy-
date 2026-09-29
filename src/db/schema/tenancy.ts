import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    status: tenantStatus("status").notNull().default("active"),
    /** Validated with tenantSettingsSchema on write and again on read (defaults for new keys). */
    config: jsonb("config").$type<StoredTenantConfig>().notNull(),
    /** Theme tokens; null means enaibler's default theme. */
    theme: jsonb("theme").$type<ThemeInput>(),
    terminology: jsonb("terminology").$type<Terminology>().notNull().default({}),
    /**
     * Monthly AI allowance in millionths of a US dollar (core/usage/allowance):
     * null is the platform default (AI_MONTHLY_ALLOWANCE_USD), -1 no limit.
     * The operator's alone, so it stays out of `config`, which the academy's
     * admins edit in the Studio and manifests replace.
     */
    aiAllowanceMicroUsd: bigint("ai_allowance_micro_usd", { mode: "number" }),
    /**
     * Video storage quota in bytes (core/media/quota): null is the platform
     * default (MEDIA_STORAGE_QUOTA_GB), -1 no limit. The operator's alone,
     * like the allowance.
     */
    mediaStorageQuotaBytes: bigint("media_storage_quota_bytes", { mode: "number" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("tenants_ai_allowance", sql`${table.aiAllowanceMicroUsd} >= -1`),
    check("tenants_media_storage_quota", sql`${table.mediaStorageQuotaBytes} >= -1`),
  ],
);

export const tenantDomains = pgTable(
  "tenant_domains",
  {
    /** Lower-case host name without port. */
    domain: text("domain").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    /**
     * Set for custom domains an academy verified itself (by DNS): these get
     * their certificates through the proxy config endpoint. Manifest and
     * platform domains are set up by the operator.
     */
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("tenant_domains_primary_idx")
      .on(table.tenantId)
      .where(sql`is_primary`),
  ],
);
