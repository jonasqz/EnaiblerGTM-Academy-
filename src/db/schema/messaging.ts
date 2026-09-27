import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { createdAt, tenantIsolation } from "@/db/schema/_shared";
import { user } from "@/db/schema/auth";
import { tenants } from "@/db/schema/tenancy";

export const notificationKind = pgEnum("notification_kind", ["review_ready", "level_up"]);
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
}

export interface LevelUpPayload {
  pathId: string;
  level: number;
}

/**
 * Transactional mail to learners (brief §9: review ready, level-up). Written
 * in the transaction of what it reports, sent by the worker. Review mails
 * wait a moment: whoever watched the result arrive on the page gets none.
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
    payload: jsonb("payload").$type<ReviewReadyPayload | LevelUpPayload>().notNull(),
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
    tenantIsolation(),
  ],
).enableRLS();
