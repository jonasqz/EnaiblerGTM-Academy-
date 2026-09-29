import {
  doublePrecision,
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
  vector,
} from "drizzle-orm/pg-core";

import type { TimedText } from "@/core/authoring/transcript";
import { createdAt, tenantIsolation, updatedAt } from "@/db/schema/_shared";
import { user } from "@/db/schema/auth";
import { courses } from "@/db/schema/catalog";
import { files } from "@/db/schema/files";
import { tenants } from "@/db/schema/tenancy";

/**
 * Embedding size for source retrieval. Depends on the embedding model chosen
 * behind LiteLLM (open decision #1); change it by migration while the table is empty.
 */
export const EMBEDDING_DIMENSIONS = 1024;

export const sourceKind = pgEnum("source_kind", ["recording", "document", "url", "interview"]);
export const sourceStatus = pgEnum("source_status", ["pending", "processing", "ready", "failed"]);

/** One topic of a recording: its time span, what was said, and a screenshot of that step. */
export interface TranscriptSegment {
  startSec: number;
  endSec: number;
  title?: string;
  text: string;
  /** Keyframe captured at the step change of this topic (a `files` row), if any. */
  keyframeFileId?: string;
}

/** Authoring sources (brief §7): recordings, documents, URLs and expert interviews. */
export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").notNull(),
    kind: sourceKind("kind").notNull(),
    status: sourceStatus("status").notNull().default("pending"),
    title: text("title").notNull(),
    /** Language the source speaks (hint for transcription). */
    locale: text("locale"),
    /** Recordings and documents: the uploaded file. */
    fileId: uuid("file_id"),
    url: text("url"),
    transcript: jsonb("transcript").$type<TranscriptSegment[]>(),
    /** Recordings: Whisper's own timed segments, which a re-live's captions are made from. */
    segments: jsonb("segments").$type<TimedText[]>(),
    /** Plain text of documents, web pages and interviews (recordings: the transcript). */
    content: text("content"),
    /** Watching sources for changes (brief §7, auto-update): hash of the last content read. */
    contentHash: text("content_hash"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    changedAt: timestamp("changed_at", { withTimezone: true }),
    error: text("error"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("sources_tenant_id").on(table.tenantId, table.id),
    foreignKey({
      name: "sources_course_fk",
      columns: [table.tenantId, table.courseId],
      foreignColumns: [courses.tenantId, courses.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "sources_file_fk",
      columns: [table.tenantId, table.fileId],
      foreignColumns: [files.tenantId, files.id],
    }),
    tenantIsolation(),
  ],
).enableRLS();

export const sourceChunks = pgTable(
  "source_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull(),
    position: integer("position").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    index("source_chunks_embedding_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
    foreignKey({
      name: "source_chunks_source_fk",
      columns: [table.tenantId, table.sourceId],
      foreignColumns: [sources.tenantId, sources.id],
    }).onDelete("cascade"),
    tenantIsolation(),
  ],
).enableRLS();

export const draftStatus = pgEnum("draft_status", ["queued", "running", "done", "failed"]);

/** "Draft lessons with AI" runs (brief §7, step 3): what was asked, what came back, what it cost. */
export const lessonDrafts = pgTable(
  "lesson_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").notNull(),
    locale: text("locale").notNull(),
    status: draftStatus("status").notNull().default("queued"),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    /** Lessons created by this run. */
    lessonIds: uuid("lesson_ids").array().notNull().default([]),
    notes: text("notes").array().notNull().default([]),
    error: text("error"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costMicroUsd: integer("cost_micro_usd"),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    unique("lesson_drafts_tenant_id").on(table.tenantId, table.id),
    foreignKey({
      name: "lesson_drafts_course_fk",
      columns: [table.tenantId, table.courseId],
      foreignColumns: [courses.tenantId, courses.id],
    }).onDelete("cascade"),
    tenantIsolation(),
  ],
).enableRLS();

/** One exemplar in a calibration run: what the author expects and what the AI said. */
export interface CalibrationResult {
  exemplarId: string;
  title: string;
  expectedPass: boolean;
  /** Null when the AI gave no valid review. */
  aiPass: boolean | null;
  aiPercent: number | null;
  aiScores: Record<string, number>;
  expectedScores?: Record<string, number>;
  summary?: string;
  error?: string;
}

/**
 * "Calibrate the review" (brief §7, step 5): the AI review run on the
 * author's good and bad exemplars, before publishing.
 */
export const calibrationRuns = pgTable(
  "calibration_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").notNull(),
    rubricVersion: integer("rubric_version").notNull(),
    status: draftStatus("status").notNull().default("queued"),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    results: jsonb("results").$type<CalibrationResult[]>().notNull().default([]),
    /** Share of exemplars where the AI verdict matched the author's (0–1). */
    agreement: doublePrecision("agreement"),
    error: text("error"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costMicroUsd: integer("cost_micro_usd"),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    unique("calibration_runs_tenant_id").on(table.tenantId, table.id),
    foreignKey({
      name: "calibration_runs_course_fk",
      columns: [table.tenantId, table.courseId],
      foreignColumns: [courses.tenantId, courses.id],
    }).onDelete("cascade"),
    tenantIsolation(),
  ],
).enableRLS();
