import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { EntryContext } from "@/core/entry/context";
import type { LandingBlock, Presenter, RegistrationForm } from "@/core/webinars/landing";
import type { GivenConsent } from "@/core/webinars/registration";
import { WEBINAR_TOOLS } from "@/core/webinars/tools";
import { createdAt, tenantIsolation, updatedAt } from "@/db/schema/_shared";
import { user } from "@/db/schema/auth";
import { courses } from "@/db/schema/catalog";
import { tenants } from "@/db/schema/tenancy";

const tenantId = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

export const webinarStatus = pgEnum("webinar_status", ["draft", "published", "cancelled"]);
export const webinarTool = pgEnum("webinar_tool", WEBINAR_TOOLS);

/**
 * A live session in the academy's own tool (webinar brief §2.2, §4: Session,
 * LandingPage, Form, Presenter). Whether it is still to come, running or
 * over follows from its times (core/webinars/phase), never from a column.
 * Title, description, page and form are in the webinar's own language.
 */
export const webinars = pgTable(
  "webinars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    slug: text("slug").notNull(),
    status: webinarStatus("status").notNull().default("draft"),
    /** The language the webinar is held in. */
    locale: text("locale").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    /** IANA zone it is held in: the page shows its time there and in the viewer's own. */
    timeZone: text("time_zone").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    /** Seats; null is no limit. */
    capacity: integer("capacity"),
    tool: webinarTool("tool").notNull().default("link"),
    /** Never shown in public HTML: registrants see it from shortly before the start. */
    joinUrl: text("join_url"),
    /** The session's id in its tool, once an adapter creates it there. */
    externalId: text("external_id"),
    /** The course it leads into (homework); a series and re-live come later. */
    courseId: uuid("course_id"),
    recorded: boolean("recorded").notNull().default(false),
    /** The host's own words about the recording; a standard notice otherwise. */
    recordingNotice: text("recording_notice"),
    presenters: jsonb("presenters").$type<Presenter[]>().notNull().default([]),
    blocks: jsonb("blocks").$type<LandingBlock[]>().notNull(),
    form: jsonb("form").$type<RegistrationForm>().notNull(),
    checkinCode: text("checkin_code").notNull(),
    /** Calendar SEQUENCE: grows with every change registrants' calendars must take. */
    sequence: integer("sequence").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("webinars_tenant_slug").on(table.tenantId, table.slug),
    unique("webinars_tenant_id").on(table.tenantId, table.id),
    index("webinars_starts_idx").on(table.tenantId, table.status, table.startsAt),
    foreignKey({
      name: "webinars_course_fk",
      columns: [table.tenantId, table.courseId],
      foreignColumns: [courses.tenantId, courses.id],
    }),
    check("webinars_duration", sql`${table.durationMinutes} between 10 and 600`),
    check("webinars_capacity", sql`${table.capacity} is null or ${table.capacity} > 0`),
    tenantIsolation(),
  ],
).enableRLS();

export const webinarRegistrationStatus = pgEnum("webinar_registration_status", [
  "pending",
  "registered",
  "waitlist",
  "cancelled",
]);

/**
 * Someone's registration (webinar brief §4, Registration). It starts
 * `pending` with the address someone typed, holds no seat and expires; the
 * magic link proves the address and turns it into the learner's own row
 * (`registered` or `waitlist`), with the address left to their account.
 */
export const webinarRegistrations = pgTable(
  "webinar_registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    webinarId: uuid("webinar_id").notNull(),
    /** Null only while pending. */
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    /** The address typed into the form, only while pending (lower case). */
    email: text("email"),
    status: webinarRegistrationStatus("status").notNull().default("pending"),
    /** Name and custom fields, by field id. */
    answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
    /** What was shown and agreed to, per purpose, with the time. */
    consents: jsonb("consents").$type<GivenConsent[]>().notNull().default([]),
    /** utm_* and the rest of the entry link, as on enrollments. */
    entryContext: jsonb("entry_context").$type<EntryContext>().notNull().default({}),
    /** The registrant's language, for mail. */
    locale: text("locale").notNull(),
    /** Hash of the token in the confirmation link (pending only). */
    confirmTokenHash: text("confirm_token_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** When the address was proven: their place in the waitlist. */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    promotedAt: timestamp("promoted_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("webinar_registrations_tenant_id").on(table.tenantId, table.id),
    // One registration per person and webinar; pending rows have no user yet.
    unique("webinar_registrations_user").on(table.tenantId, table.webinarId, table.userId),
    uniqueIndex("webinar_registrations_pending_email")
      .on(table.tenantId, table.webinarId, table.email)
      .where(sql`${table.email} is not null`),
    index("webinar_registrations_status_idx").on(table.tenantId, table.webinarId, table.status),
    foreignKey({
      name: "webinar_registrations_webinar_fk",
      columns: [table.tenantId, table.webinarId],
      foreignColumns: [webinars.tenantId, webinars.id],
    }).onDelete("cascade"),
    check(
      "webinar_registrations_owner",
      sql`${table.userId} is not null or (${table.status} = 'pending' and ${table.email} is not null)`,
    ),
    tenantIsolation(),
  ],
).enableRLS();

export const webinarAttendanceSource = pgEnum("webinar_attendance_source", [
  "checkin_code",
  "manual",
  "tool_report",
]);

/** Who was there (webinar brief §4, Attendance): by check-in code, a file, or the tool's report. */
export const webinarAttendance = pgTable(
  "webinar_attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    webinarId: uuid("webinar_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    source: webinarAttendanceSource("source").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
    durationMinutes: integer("duration_minutes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("webinar_attendance_user").on(table.tenantId, table.webinarId, table.userId),
    foreignKey({
      name: "webinar_attendance_webinar_fk",
      columns: [table.tenantId, table.webinarId],
      foreignColumns: [webinars.tenantId, webinars.id],
    }).onDelete("cascade"),
    tenantIsolation(),
  ],
).enableRLS();
