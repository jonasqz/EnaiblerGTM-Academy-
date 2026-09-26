import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { FileKind } from "@/core/assignments/submission-types";
import type { EntryContext } from "@/core/entry/context";
import type { AuditReason, HoldReason } from "@/core/review/policy";
import { createdAt, tenantIsolation } from "@/db/schema/_shared";
import { user } from "@/db/schema/auth";
import { assignments, courses, paths } from "@/db/schema/catalog";
import { tenants } from "@/db/schema/tenancy";

const tenantId = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

export type LessonProgress = Record<string, { completedAt: string }>;

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").notNull(),
    /** Path the learner took this course in, if any. */
    pathId: uuid("path_id"),
    locale: text("locale").notNull(),
    /** Completed lessons by lesson key. */
    lessonProgress: jsonb("lesson_progress").$type<LessonProgress>().notNull().default({}),
    /** Where to resume. */
    lastLessonKey: text("last_lesson_key"),
    /** path, lang and utm_* from the entry link, carried through sign-up (brief §5). */
    entryContext: jsonb("entry_context").$type<EntryContext>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    unique("enrollments_unique").on(table.tenantId, table.userId, table.courseId),
    unique("enrollments_tenant_id").on(table.tenantId, table.id),
    foreignKey({
      name: "enrollments_course_fk",
      columns: [table.tenantId, table.courseId],
      foreignColumns: [courses.tenantId, courses.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "enrollments_path_fk",
      columns: [table.tenantId, table.pathId],
      foreignColumns: [paths.tenantId, paths.id],
    }),
    tenantIsolation(),
  ],
).enableRLS();

export const submissionStatus = pgEnum("submission_status", [
  "submitted",
  "in_review",
  "needs_revision",
  "passed",
  "overridden",
]);

export interface SubmittedFile {
  key: string;
  name: string;
  mimeType: string;
  size: number;
  kind: FileKind;
}

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    assignmentId: uuid("assignment_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    attemptNo: integer("attempt_no").notNull(),
    status: submissionStatus("status").notNull().default("submitted"),
    files: jsonb("files").$type<SubmittedFile[]>().notNull().default([]),
    formData: jsonb("form_data").$type<Record<string, unknown>>(),
    url: text("url"),
    /** Text extracted from PDF/Markdown; input for the review and evidence checks. */
    extractedText: text("extracted_text"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [
    unique("submissions_attempt").on(table.assignmentId, table.userId, table.attemptNo),
    unique("submissions_tenant_id").on(table.tenantId, table.id),
    index("submissions_status_idx").on(table.tenantId, table.status),
    foreignKey({
      name: "submissions_assignment_fk",
      columns: [table.tenantId, table.assignmentId],
      foreignColumns: [assignments.tenantId, assignments.id],
    }).onDelete("cascade"),
    tenantIsolation(),
  ],
).enableRLS();

export const reviewerType = pgEnum("reviewer_type", ["ai", "human"]);

export interface ReviewCriterionResult {
  criterionId: string;
  score: number;
  feedback: string;
  evidence: Array<{ quote: string; verified: boolean }>;
}

export interface ReviewOverall {
  percent: number;
  pass: boolean;
  summary: string;
}

export type ReviewRoutingRecord =
  { release: true; audit: AuditReason | null } | { release: false; reasons: HoldReason[] };

/** AI and human reviews. A human override is a new row; the AI review stays for audit. */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    submissionId: uuid("submission_id").notNull(),
    reviewerType: reviewerType("reviewer_type").notNull(),
    reviewerUserId: text("reviewer_user_id").references(() => user.id, { onDelete: "set null" }),
    criteria: jsonb("criteria").$type<ReviewCriterionResult[]>().notNull(),
    overall: jsonb("overall").$type<ReviewOverall>().notNull(),
    routing: jsonb("routing").$type<ReviewRoutingRecord>(),
    rubricVersion: integer("rubric_version").notNull(),
    model: text("model"),
    promptVersion: text("prompt_version"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    /**
     * Cost reported by LiteLLM, in millionths of a US dollar (its default price
     * currency). Brief §8 target: under €0.10 per review.
     */
    costMicroUsd: integer("cost_micro_usd"),
    /** Set on human reviews that override an earlier review. */
    overridesReviewId: uuid("overrides_review_id"),
    overrideReason: text("override_reason"),
    createdAt: createdAt(),
  },
  (table) => [
    index("reviews_submission_idx").on(table.submissionId),
    unique("reviews_tenant_id").on(table.tenantId, table.id),
    foreignKey({
      name: "reviews_submission_fk",
      columns: [table.tenantId, table.submissionId],
      foreignColumns: [submissions.tenantId, submissions.id],
    }).onDelete("cascade"),
    tenantIsolation(),
  ],
).enableRLS();
