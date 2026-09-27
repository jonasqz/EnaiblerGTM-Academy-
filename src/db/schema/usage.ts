import { index, integer, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { AI_USAGE_KINDS } from "@/core/usage/ai-usage";
import { createdAt, tenantIsolation } from "@/db/schema/_shared";
import { tenants } from "@/db/schema/tenancy";

export const aiUsageKind = pgEnum("ai_usage_kind", AI_USAGE_KINDS);

/**
 * One row per model call (or batch) an academy caused, written right after
 * the call and outside the work it served, so failed runs are counted too
 * (core/usage/ai-usage). No learner is named: usage is about the academy.
 * Course and reference ids are kept without foreign keys, because usage
 * outlives the courses and submissions it was for.
 */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: aiUsageKind("kind").notNull(),
    model: text("model"),
    courseId: uuid("course_id"),
    /** The submission, run, source or draft the call was for. */
    refId: uuid("ref_id"),
    calls: integer("calls").notNull().default(1),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    audioSeconds: integer("audio_seconds"),
    /** As the gateway reports it, in millionths of a US dollar; null when it does not know. */
    costMicroUsd: integer("cost_micro_usd"),
    createdAt: createdAt(),
  },
  (table) => [
    index("ai_usage_tenant_time_idx").on(table.tenantId, table.createdAt),
    tenantIsolation(),
  ],
).enableRLS();
