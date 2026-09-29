import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { WebinarMailStep } from "@/core/webinars/reminders";
import { createdAt, tenantIsolation } from "@/db/schema/_shared";
import { user } from "@/db/schema/auth";
import { tenants } from "@/db/schema/tenancy";

export const notificationKind = pgEnum("notification_kind", [
  "review_ready",
  "level_up",
  "team_invite",
  "review_waiting",
  "webinar",
]);
export const notificationStatus = pgEnum("notification_status", [
  "pending",
  "sent",
  "skipped",
  "failed",
]);

export interface ReviewReadyPayload {
  submissionId: string;
  /** Level reached with this pass, if any: one mail says both. */
  levelUp: number | null;
  /** A reviewer changed a result the learner had already seen. */
  secondLook: boolean;
  /** The work passed, but the credential waits for the course's final test. */
  testPending?: boolean;
}

export interface LevelUpPayload {
  pathId: string;
  level: number;
}

/** Someone was added to the academy's team; the mail names their roles as they are when it goes out. */
export interface TeamInvitePayload {
  /** Studio language of the admin who sent it: the invitation is written in it. */
  locale: string;
}

/** Hand-ins waiting for this team member, collected until the mail goes out. */
export interface ReviewWaitingPayload {
  submissionIds: string[];
}

/**
 * A mail about someone's webinar registration (server/webinars/mail.ts).
 * Reminders carry the start they were planned for: a webinar that moved
 * since skips them (it re-plans its own).
 */
export interface WebinarMailPayload {
  webinarId: string;
  registrationId: string;
  step: WebinarMailStep;
  plannedFor?: string;
}

export type NotificationPayload =
  | ReviewReadyPayload
  | LevelUpPayload
  | TeamInvitePayload
  | ReviewWaitingPayload
  | WebinarMailPayload;

/**
 * Someone's review alert that has not gone out yet; the unique index below
 * and its upsert share it. It goes by the payload, not by `kind`: migrations
 * run in one transaction, and Postgres refuses an enum value added in the
 * same transaction (an index predicate cannot cast the enum to text either).
 */
export const REVIEW_WAITING_PENDING = sql.raw(
  `"status" = 'pending' and "payload" ? 'submissionIds'`,
);

/**
 * Transactional mail (brief §9): to learners (review ready, level-up) and to
 * the academy's team (an invitation, hand-ins waiting for review). Written in
 * the transaction of what it reports, sent by the worker. Review mails wait a
 * moment: whoever watched the result arrive on the page gets none.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: notificationKind("kind").notNull(),
    payload: jsonb("payload").$type<NotificationPayload>().notNull(),
    status: notificationStatus("status").notNull().default("pending"),
    sendAfter: timestamp("send_after", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    /** Why it was skipped ("seen", "superseded", …) or the last error. */
    note: text("note"),
    createdAt: createdAt(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    index("notifications_due_idx").on(table.tenantId, table.status, table.sendAfter),
    // One waiting review alert per person: new hand-ins join it (see server/review/alerts.ts).
    uniqueIndex("notifications_review_waiting_idx")
      .on(table.tenantId, table.userId)
      .where(REVIEW_WAITING_PENDING),
    tenantIsolation(),
  ],
).enableRLS();
