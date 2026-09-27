import { sql } from "drizzle-orm";
import {
  foreignKey,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, currentUserId, tenantIsolation, updatedAt } from "@/db/schema/_shared";
import { user } from "@/db/schema/auth";
import { paths } from "@/db/schema/catalog";
import { tenants } from "@/db/schema/tenancy";

export const membershipRole = pgEnum("membership_role", [
  "learner",
  "author",
  "reviewer",
  "mentor",
  "tenant_admin",
]);

/** One global user, roles per academy (brief §4, Membership). */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
    /** Mentors are cohort-scoped (phase 2). */
    cohortId: uuid("cohort_id"),
    createdAt: createdAt(),
  },
  (table) => [
    unique("memberships_unique")
      .on(table.tenantId, table.userId, table.role, table.cohortId)
      .nullsNotDistinct(),
    tenantIsolation(),
    // Read-only view of one's own memberships across academies, only inside
    // withUser() (account deletion must know whether other academies remain).
    pgPolicy("own_memberships", {
      as: "permissive",
      for: "select",
      using: sql`user_id = ${currentUserId}`,
    }),
  ],
).enableRLS();

/** Per-academy learner profile: chosen path, UI language, default name for credentials. */
export const learnerProfiles = pgTable(
  "learner_profiles",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    locale: text("locale"),
    currentPathId: uuid("current_path_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.userId] }),
    foreignKey({
      name: "learner_profiles_path_fk",
      columns: [table.tenantId, table.currentPathId],
      foreignColumns: [paths.tenantId, paths.id],
    }),
    tenantIsolation(),
  ],
).enableRLS();
