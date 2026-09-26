import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { SubmissionType } from "@/core/assignments/submission-types";
import { DELIVERY_MODES, type ZfuApproval } from "@/core/compliance/delivery-mode";
import type { LocalizedText } from "@/core/i18n/locales";
import type { LevelDefinition } from "@/core/levels/rules";
import type { Rubric } from "@/core/review/rubric";
import { createdAt, tenantIsolation, updatedAt } from "@/db/schema/_shared";
import { user } from "@/db/schema/auth";
import { tenants } from "@/db/schema/tenancy";

/*
 * Child tables reference parents through (tenant_id, id) composite foreign
 * keys, so the database itself refuses cross-tenant links (e.g. a path in
 * tenant A pointing at a course of tenant B).
 */

const tenantId = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

export const paths = pgTable(
  "paths",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    slug: text("slug").notNull(),
    title: jsonb("title").$type<LocalizedText>().notNull(),
    promise: jsonb("promise").$type<LocalizedText>(),
    color: text("color"),
    /** Storage keys or asset paths: { svg, png } (png is rendered from svg and cached). */
    visual: jsonb("visual").$type<{ svg?: string; png?: string }>(),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("paths_tenant_slug").on(table.tenantId, table.slug),
    unique("paths_tenant_id").on(table.tenantId, table.id),
    tenantIsolation(),
  ],
).enableRLS();

export const deliveryMode = pgEnum("delivery_mode", DELIVERY_MODES);
export const courseStatus = pgEnum("course_status", [
  "draft",
  "published",
  "unpublished",
  "archived",
]);

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    slug: text("slug").notNull(),
    title: jsonb("title").$type<LocalizedText>().notNull(),
    summary: jsonb("summary").$type<LocalizedText>(),
    /** Locales the course content exists in. */
    languages: text("languages").array().notNull().default([]),
    deliveryMode: deliveryMode("delivery_mode").notNull().default("free_async"),
    status: courseStatus("status").notNull().default("draft"),
    /** Incremented on every publish. */
    version: integer("version").notNull().default(0),
    estMinutes: integer("est_minutes"),
    /** "YYYY-MM" or "YYYY-MM-DD" from the manifest; informational. */
    plannedLaunch: text("planned_launch"),
    /** Paid live courses must never offer recordings (FernUSG, brief §9). */
    offersRecordings: boolean("offers_recordings").notNull().default(false),
    zfuApproval: jsonb("zfu_approval").$type<ZfuApproval>(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("courses_tenant_slug").on(table.tenantId, table.slug),
    unique("courses_tenant_id").on(table.tenantId, table.id),
    tenantIsolation(),
  ],
).enableRLS();

/** Ordered courses of a path. */
export const pathCourses = pgTable(
  "path_courses",
  {
    tenantId: tenantId(),
    pathId: uuid("path_id").notNull(),
    courseId: uuid("course_id").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.pathId, table.courseId] }),
    foreignKey({
      name: "path_courses_path_fk",
      columns: [table.tenantId, table.pathId],
      foreignColumns: [paths.tenantId, paths.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "path_courses_course_fk",
      columns: [table.tenantId, table.courseId],
      foreignColumns: [courses.tenantId, courses.id],
    }).onDelete("cascade"),
    tenantIsolation(),
  ],
).enableRLS();

/** One level scheme per tenant (optional module). */
export const levelSchemes = pgTable(
  "level_schemes",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    levels: jsonb("levels").$type<LevelDefinition[]>().notNull(),
    updatedAt: updatedAt(),
  },
  () => [tenantIsolation()],
).enableRLS();

/** Levels with the `manual_grant` rule (e.g. "Mentor"). */
export const levelGrants = pgTable(
  "level_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    pathId: uuid("path_id").notNull(),
    levelN: integer("level_n").notNull(),
    grantedBy: text("granted_by").references(() => user.id, { onDelete: "set null" }),
    reason: text("reason"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("level_grants_unique").on(table.tenantId, table.userId, table.pathId, table.levelN),
    foreignKey({
      name: "level_grants_path_fk",
      columns: [table.tenantId, table.pathId],
      foreignColumns: [paths.tenantId, paths.id],
    }).onDelete("cascade"),
    tenantIsolation(),
  ],
).enableRLS();

export type LessonBlock =
  | { type: "markdown"; markdown: string }
  | { type: "image"; key: string; alt: string; caption?: string }
  | { type: "video"; key: string; caption?: string; poster?: string };

/**
 * Lessons exist per locale; `key` links the translations of one lesson so
 * progress survives a language switch.
 */
export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    courseId: uuid("course_id").notNull(),
    locale: text("locale").notNull(),
    key: text("key").notNull(),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    blocks: jsonb("blocks").$type<LessonBlock[]>().notNull().default([]),
    /** Rubric criteria this lesson teaches (coverage map, brief §7). */
    criterionIds: text("criterion_ids").array().notNull().default([]),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("lessons_course_locale_key").on(table.courseId, table.locale, table.key),
    unique("lessons_tenant_id").on(table.tenantId, table.id),
    index("lessons_course_idx").on(table.courseId, table.locale, table.position),
    foreignKey({
      name: "lessons_course_fk",
      columns: [table.tenantId, table.courseId],
      foreignColumns: [courses.tenantId, courses.id],
    }).onDelete("cascade"),
    tenantIsolation(),
  ],
).enableRLS();

export const lessonVersions = pgTable(
  "lesson_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    lessonId: uuid("lesson_id").notNull(),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    blocks: jsonb("blocks").$type<LessonBlock[]>().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("lesson_versions_unique").on(table.lessonId, table.version),
    foreignKey({
      name: "lesson_versions_lesson_fk",
      columns: [table.tenantId, table.lessonId],
      foreignColumns: [lessons.tenantId, lessons.id],
    }).onDelete("cascade"),
    tenantIsolation(),
  ],
).enableRLS();

/** Rubric definition validated with `rubricSchema`; `version` bumps on every edit. */
export const rubrics = pgTable(
  "rubrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    definition: jsonb("definition").$type<Rubric>().notNull(),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique("rubrics_tenant_id").on(table.tenantId, table.id), tenantIsolation()],
).enableRLS();

/** Exactly one required assignment per course. */
export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    courseId: uuid("course_id").notNull(),
    prompt: jsonb("prompt").$type<LocalizedText>().notNull(),
    artifactName: jsonb("artifact_name").$type<LocalizedText>().notNull(),
    submissionTypes: jsonb("submission_types").$type<SubmissionType[]>().notNull(),
    rubricId: uuid("rubric_id").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("assignments_one_per_course").on(table.tenantId, table.courseId),
    unique("assignments_tenant_id").on(table.tenantId, table.id),
    foreignKey({
      name: "assignments_course_fk",
      columns: [table.tenantId, table.courseId],
      foreignColumns: [courses.tenantId, courses.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "assignments_rubric_fk",
      columns: [table.tenantId, table.rubricId],
      foreignColumns: [rubrics.tenantId, rubrics.id],
    }),
    tenantIsolation(),
  ],
).enableRLS();
