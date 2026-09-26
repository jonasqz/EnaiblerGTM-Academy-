import {
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { LocalizedText } from "@/core/i18n/locales";
import { createdAt, tenantIsolation, updatedAt } from "@/db/schema/_shared";
import { user } from "@/db/schema/auth";
import { courses, paths } from "@/db/schema/catalog";
import { tenants } from "@/db/schema/tenancy";

export const credentialVisibility = pgEnum("credential_visibility", ["private", "public"]);
export const credentialSource = pgEnum("credential_source", ["native", "imported"]);

/**
 * Credentials (brief §6). Private by default; `display_name` exactly as the
 * learner entered it. Course, path, level and artifact names are snapshots at
 * issue time so later edits do not rewrite history. Deleting the learner
 * deletes the credential; its verification page then reads "no longer available".
 */
export const credentials = pgTable(
  "credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Unguessable id used in /verify/<public_id> (see core/credentials/public-id). */
    publicId: text("public_id").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").notNull(),
    pathId: uuid("path_id"),
    levelAtIssue: integer("level_at_issue"),
    levelName: jsonb("level_name").$type<LocalizedText>(),
    courseTitle: jsonb("course_title").$type<LocalizedText>().notNull(),
    artifactName: text("artifact_name").notNull(),
    displayName: text("display_name").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    visibility: credentialVisibility("visibility").notNull().default("private"),
    madePublicAt: timestamp("made_public_at", { withTimezone: true }),
    source: credentialSource("source").notNull().default("native"),
    sourcePlatform: text("source_platform"),
    externalId: text("external_id"),
    submissionId: uuid("submission_id"),
    ob3Json: jsonb("ob3_json").$type<Record<string, unknown>>(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeReason: text("revoke_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("credentials_one_per_course").on(table.tenantId, table.userId, table.courseId),
    unique("credentials_import_idempotency").on(
      table.tenantId,
      table.sourcePlatform,
      table.externalId,
    ),
    foreignKey({
      name: "credentials_course_fk",
      columns: [table.tenantId, table.courseId],
      foreignColumns: [courses.tenantId, courses.id],
    }),
    foreignKey({
      name: "credentials_path_fk",
      columns: [table.tenantId, table.pathId],
      foreignColumns: [paths.tenantId, paths.id],
    }),
    tenantIsolation(),
  ],
).enableRLS();
