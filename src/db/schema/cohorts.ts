import {
  date,
  foreignKey,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, tenantIsolation } from "@/db/schema/_shared";
import { user } from "@/db/schema/auth";
import { courses } from "@/db/schema/catalog";
import { tenants } from "@/db/schema/tenancy";

export const cohortStatus = pgEnum("cohort_status", ["open", "closed"]);

/**
 * A group taking a course together (brief §4, Cohort; features.cohorts).
 * Learners join through the cohort's link; mentors are memberships with the
 * role "mentor" scoped to the cohort (see people.ts) and review its work.
 */
export const cohorts = pgTable(
  "cohorts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").notNull(),
    name: text("name").notNull(),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    /** In the join link (/join/<code>); unguessable, so links cannot be enumerated. */
    joinCode: text("join_code").notNull(),
    /** Closed cohorts take no new learners; everyone in them keeps going. */
    status: cohortStatus("status").notNull().default("open"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("cohorts_tenant_id").on(table.tenantId, table.id),
    unique("cohorts_join_code").on(table.joinCode),
    foreignKey({
      name: "cohorts_course_fk",
      columns: [table.tenantId, table.courseId],
      foreignColumns: [courses.tenantId, courses.id],
    }).onDelete("cascade"),
    tenantIsolation(),
  ],
).enableRLS();

export const cohortMembers = pgTable(
  "cohort_members",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    cohortId: uuid("cohort_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.cohortId, table.userId] }),
    foreignKey({
      name: "cohort_members_cohort_fk",
      columns: [table.tenantId, table.cohortId],
      foreignColumns: [cohorts.tenantId, cohorts.id],
    }).onDelete("cascade"),
    tenantIsolation(),
  ],
).enableRLS();
