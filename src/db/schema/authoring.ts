import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

import { createdAt, tenantIsolation, updatedAt } from "@/db/schema/_shared";
import { user } from "@/db/schema/auth";
import { courses } from "@/db/schema/catalog";
import { tenants } from "@/db/schema/tenancy";

/**
 * Embedding size for source retrieval. Depends on the embedding model chosen
 * behind LiteLLM (open decision #1); change it by migration while the table is empty.
 */
export const EMBEDDING_DIMENSIONS = 1024;

export const sourceKind = pgEnum("source_kind", ["recording", "document", "url", "interview"]);
export const sourceStatus = pgEnum("source_status", ["pending", "processing", "ready", "failed"]);

export interface TranscriptSegment {
  startSec: number;
  endSec: number;
  text: string;
  /** Storage key of the keyframe captured at this step change, if any. */
  keyframeKey?: string;
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
    storageKey: text("storage_key"),
    url: text("url"),
    transcript: jsonb("transcript").$type<TranscriptSegment[]>(),
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
