import {
  bigint,
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
} from "drizzle-orm/pg-core";

import type { TimedText } from "@/core/authoring/transcript";
import type { Locale } from "@/core/i18n/locales";
import { MEDIA_ACCESS } from "@/core/media/access";
import type { Chapter } from "@/core/media/chapters";
import type { ExternalVideo } from "@/core/media/embeds";
import type { WatchRange } from "@/core/media/ranges";
import type { Rendition } from "@/core/media/transcode";
import { createdAt, tenantIsolation, updatedAt } from "@/db/schema/_shared";
import { user } from "@/db/schema/auth";
import { files } from "@/db/schema/files";
import { tenants } from "@/db/schema/tenancy";

export const mediaKind = pgEnum("media_kind", ["upload", "external_embed"]);
export const mediaStatus = pgEnum("media_status", ["processing", "ready", "failed"]);
export const mediaAccess = pgEnum("media_access", MEDIA_ACCESS);
export const mediaTranscriptStatus = pgEnum("media_transcript_status", [
  "none",
  "processing",
  "ready",
  "failed",
]);

/**
 * The academy's videos (webinar brief §2.4, §4 MediaAsset): uploads we
 * transcode to HLS and serve ourselves, and embeds of videos the academy
 * hosts on YouTube or Vimeo. Lessons (and later webinar sessions) point at
 * them; the files live under tenants/<id>/media/<asset id>/<run>/.
 */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: mediaKind("kind").notNull(),
    /** Embeds are ready at once; uploads once transcoded. */
    status: mediaStatus("status").notNull().default("processing"),
    /** Why processing failed: a code the Studio words (core/media/access, core/authoring/job-errors). */
    error: text("error"),
    title: text("title").notNull(),
    /** The language spoken: transcription hint and the captions' own language. */
    locale: text("locale"),
    access: mediaAccess("access").notNull().default("learners"),
    /** The uploaded original, kept to transcode again; null for embeds and recordings. */
    fileId: uuid("file_id"),
    /**
     * The course recording it was made from. No foreign key: sources go with
     * their course, and the video keeps its own renditions and transcript.
     */
    sourceId: uuid("source_id"),
    embed: jsonb("embed").$type<ExternalVideo>(),
    /** The transcode run whose files are served (its folder under the asset's prefix). */
    hlsRun: text("hls_run"),
    /** Bytes of the served renditions and poster, for the storage quota. */
    hlsBytes: bigint("hls_bytes", { mode: "number" }).notNull().default(0),
    renditions: jsonb("renditions").$type<Rendition[]>().notNull().default([]),
    durationSec: doublePrecision("duration_sec"),
    width: integer("width"),
    height: integer("height"),
    chapters: jsonb("chapters").$type<Chapter[]>().notNull().default([]),
    transcriptStatus: mediaTranscriptStatus("transcript_status").notNull().default("none"),
    transcriptError: text("transcript_error"),
    /** Whisper's fine segments in `locale`: the captions and the searchable transcript. */
    transcript: jsonb("transcript").$type<TimedText[]>(),
    /** Captions in other languages, by locale (translations of the transcript). */
    captions: jsonb("captions").$type<Partial<Record<Locale, TimedText[]>>>().notNull().default({}),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
  },
  (table) => [
    unique("media_assets_tenant_id").on(table.tenantId, table.id),
    index("media_assets_created_idx").on(table.tenantId, table.createdAt),
    foreignKey({
      name: "media_assets_file_fk",
      columns: [table.tenantId, table.fileId],
      foreignColumns: [files.tenantId, files.id],
    }),
    tenantIsolation(),
  ],
).enableRLS();

/**
 * What each signed-in viewer played of a video (webinar brief §2.4, watch
 * tracking): the ranges themselves, so "watched" means watched and the
 * Studio can show drop-off by minute. Anonymous viewers leave no row.
 */
export const watchProgress = pgTable(
  "watch_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ranges: jsonb("ranges").$type<WatchRange[]>().notNull().default([]),
    watchedSec: doublePrecision("watched_sec").notNull().default(0),
    /** The length `percent` is measured against (embeds: as their player reported it). */
    durationSec: doublePrecision("duration_sec"),
    percent: integer("percent").notNull().default(0),
    /** Where the viewer was last: the player resumes there. */
    positionSec: doublePrecision("position_sec"),
    firstWatchedAt: timestamp("first_watched_at", { withTimezone: true }).notNull().defaultNow(),
    lastWatchedAt: timestamp("last_watched_at", { withTimezone: true }).notNull().defaultNow(),
    /** When the ranges first covered the academy's threshold; never cleared. */
    thresholdReachedAt: timestamp("threshold_reached_at", { withTimezone: true }),
  },
  (table) => [
    unique("watch_progress_viewer").on(table.tenantId, table.assetId, table.userId),
    index("watch_progress_user_idx").on(table.tenantId, table.userId),
    foreignKey({
      name: "watch_progress_asset_fk",
      columns: [table.tenantId, table.assetId],
      foreignColumns: [mediaAssets.tenantId, mediaAssets.id],
    }).onDelete("cascade"),
    tenantIsolation(),
  ],
).enableRLS();
