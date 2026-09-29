import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import type { MediaAccess } from "@/core/media/access";
import { normalizeChapters, renameChapters } from "@/core/media/chapters";
import { parseVideoUrl } from "@/core/media/embeds";
import type { Locale } from "@/core/i18n/locales";
import { objectKey } from "@/core/storage/keys";
import type { Database, Transaction } from "@/db/client";
import {
  courses,
  files,
  lessons,
  mediaAssets,
  memberships,
  sources,
  watchProgress,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { deleteFiles, loadFile, type FileRecord } from "@/server/files";
import type { Enqueue } from "@/server/jobs/producer";
import { QUEUES } from "@/server/jobs/queues";
import { admitMediaBytes } from "@/server/media/quota";
import { deleteUnderPrefix, storageConfigured } from "@/server/storage";

/*
 * The academy's media library (webinar brief §2.4): videos uploaded here,
 * made from a course recording, or embedded from YouTube and Vimeo. Lessons
 * show them with the re-live player; webinar sessions will too. Used by the
 * Studio, the worker and the tests, so no Next.js here.
 */

export type MediaAsset = typeof mediaAssets.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Everything of one video in storage: its renditions of every run, and its poster. */
export function mediaPrefix(assetId: string): string {
  if (!UUID.test(assetId)) throw new Error(`Invalid media id: ${assetId}`);
  return `${assetId.toLowerCase()}/`;
}

/** Storage key of one served file of a transcode run. */
export function mediaKey(tenantId: string, assetId: string, run: string, path: string): string {
  return objectKey(tenantId, "media", assetId.toLowerCase(), run, ...path.split("/"));
}

export async function loadVideo(
  db: Database,
  tenantId: string,
  assetId: string,
): Promise<MediaAsset | null> {
  if (!UUID.test(assetId)) return null;
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx.select().from(mediaAssets).where(eq(mediaAssets.id, assetId)),
  );
  return row ?? null;
}

export async function updateVideoRow(
  db: Database,
  tenantId: string,
  assetId: string,
  patch: Partial<Omit<MediaAsset, "id" | "tenantId" | "createdAt">>,
): Promise<void> {
  await withTenant(db, tenantId, (tx) =>
    tx.update(mediaAssets).set(patch).where(eq(mediaAssets.id, assetId)),
  );
}

export type CreateVideoResult =
  | { ok: true; id: string }
  | {
      ok: false;
      issue: "not_found" | "not_video" | "in_use" | "not_ready" | "storage_quota" | "invalid_url";
    };

async function queueProcessing(
  tx: Transaction,
  enqueue: Enqueue,
  tenantId: string,
  assetId: string,
  transcribe: boolean,
): Promise<void> {
  // The asset id makes the transcode job idempotent: a double submit queues it once.
  await enqueue(tx, QUEUES.mediaTranscode, { tenantId, assetId }, { id: assetId });
  if (transcribe) await enqueue(tx, QUEUES.mediaTranscribe, { tenantId, assetId });
}

/**
 * A video uploaded to the library (purpose `video`). The upload waits as
 * the uploader's pending file until this claims it for the academy.
 */
export async function createUploadedVideo(
  db: Database,
  tenantId: string,
  input: { fileId: string; title: string; locale: Locale | null; createdBy: string },
  enqueue: Enqueue,
): Promise<CreateVideoResult> {
  const file = await loadFile(db, tenantId, input.fileId);
  if (!file || file.purpose !== "video") return { ok: false, issue: "not_video" };
  if (file.status === "pending" && file.ownerUserId !== input.createdBy) {
    return { ok: false, issue: "not_found" };
  }
  return withTenant(db, tenantId, async (tx) => {
    const [taken] = await tx
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(eq(mediaAssets.fileId, file.id));
    if (taken) return { ok: false, issue: "in_use" } as const;
    // Claimed for the academy: the video outlives the account of whoever uploaded it.
    await tx
      .update(files)
      .set({ status: "attached", attachedAt: new Date(), ownerUserId: null })
      .where(eq(files.id, file.id));
    const [asset] = await tx
      .insert(mediaAssets)
      .values({
        tenantId,
        kind: "upload",
        title: input.title.trim().slice(0, 200) || file.name.replace(/\.[^.]+$/, ""),
        locale: input.locale,
        fileId: file.id,
        transcriptStatus: "processing",
        createdBy: input.createdBy,
      })
      .returning({ id: mediaAssets.id });
    await queueProcessing(tx, enqueue, tenantId, asset!.id, true);
    return { ok: true, id: asset!.id } as const;
  });
}

/**
 * A video made from a course's screen recording (brief §2.1: the recording
 * stays in the course as a re-live). Its transcript and topics come along;
 * only a recording transcribed before we kept Whisper's segments is
 * transcribed again.
 */
export async function createVideoFromRecording(
  db: Database,
  tenantId: string,
  input: { sourceId: string; title?: string; createdBy: string },
  enqueue: Enqueue,
): Promise<CreateVideoResult> {
  if (!UUID.test(input.sourceId)) return { ok: false, issue: "not_found" };
  const [source] = await withTenant(db, tenantId, (tx) =>
    tx.select().from(sources).where(eq(sources.id, input.sourceId)),
  );
  if (!source || source.kind !== "recording" || !source.fileId) {
    return { ok: false, issue: "not_found" };
  }
  const file = await loadFile(db, tenantId, source.fileId);
  if (!file) return { ok: false, issue: "not_found" };
  if (!file.contentType.startsWith("video/")) return { ok: false, issue: "not_video" };
  if (source.status === "pending" || source.status === "processing") {
    return { ok: false, issue: "not_ready" };
  }
  // The renditions take about as much room as the recording itself.
  if (!(await admitMediaBytes(db, tenantId, file.sizeBytes))) {
    return { ok: false, issue: "storage_quota" };
  }
  const transcript = source.segments?.length ? source.segments : null;
  return withTenant(db, tenantId, async (tx) => {
    const [asset] = await tx
      .insert(mediaAssets)
      .values({
        tenantId,
        kind: "upload",
        title: (input.title?.trim() || source.title).slice(0, 200),
        locale: source.locale,
        sourceId: source.id,
        transcript,
        transcriptStatus: transcript ? "ready" : "processing",
        chapters: normalizeChapters(
          (source.transcript ?? []).map((topic) => ({
            startSec: topic.startSec,
            title: topic.title,
          })),
        ),
        createdBy: input.createdBy,
      })
      .returning({ id: mediaAssets.id });
    await queueProcessing(tx, enqueue, tenantId, asset!.id, !transcript);
    return { ok: true, id: asset!.id } as const;
  });
}

/** A YouTube or Vimeo video the academy already hosts: ready at once, loaded only after consent. */
export async function createEmbeddedVideo(
  db: Database,
  tenantId: string,
  input: { url: string; title: string; locale: Locale | null; createdBy: string },
): Promise<CreateVideoResult> {
  const embed = parseVideoUrl(input.url);
  if (!embed) return { ok: false, issue: "invalid_url" };
  const [asset] = await withTenant(db, tenantId, (tx) =>
    tx
      .insert(mediaAssets)
      .values({
        tenantId,
        kind: "external_embed",
        status: "ready",
        title: input.title.trim().slice(0, 200) || `${embed.provider} ${embed.id}`,
        locale: input.locale,
        embed,
        readyAt: new Date(),
        createdBy: input.createdBy,
      })
      .returning({ id: mediaAssets.id }),
  );
  return { ok: true, id: asset!.id };
}

/** The file a video is transcoded and transcribed from: its upload, or its recording's. */
export async function originalOf(
  db: Database,
  tenantId: string,
  asset: Pick<MediaAsset, "fileId" | "sourceId">,
): Promise<FileRecord | null> {
  if (asset.fileId) return loadFile(db, tenantId, asset.fileId);
  if (!asset.sourceId) return null;
  const [source] = await withTenant(db, tenantId, (tx) =>
    tx.select({ fileId: sources.fileId }).from(sources).where(eq(sources.id, asset.sourceId!)),
  );
  return source?.fileId ? loadFile(db, tenantId, source.fileId) : null;
}

/** Team members are no audience: their watching is left out of the numbers, like elsewhere. */
const byLearners = sql`not exists (select 1 from ${memberships} team where team.user_id = ${watchProgress.userId} and team.role in ('author', 'reviewer', 'tenant_admin'))`;

export interface LibraryVideo extends MediaAsset {
  viewers: number;
}

/** The library, newest first, with how many learners pressed play on each video. */
export async function listVideos(db: Database, tenantId: string): Promise<LibraryVideo[]> {
  return withTenant(db, tenantId, async (tx) => {
    const rows = await tx.select().from(mediaAssets).orderBy(desc(mediaAssets.createdAt));
    const counts = await tx
      .select({ assetId: watchProgress.assetId, viewers: sql<number>`count(*)::int` })
      .from(watchProgress)
      .where(byLearners)
      .groupBy(watchProgress.assetId);
    const viewers = new Map(counts.map((row) => [row.assetId, row.viewers]));
    return rows.map((row) => ({ ...row, viewers: viewers.get(row.id) ?? 0 }));
  });
}

/** What learners played of one video: their ranges, for drop-off by minute. */
export async function watchRows(db: Database, tenantId: string, assetId: string) {
  return withTenant(db, tenantId, (tx) =>
    tx
      .select({
        ranges: watchProgress.ranges,
        percent: watchProgress.percent,
        durationSec: watchProgress.durationSec,
        thresholdReachedAt: watchProgress.thresholdReachedAt,
      })
      .from(watchProgress)
      .where(and(eq(watchProgress.assetId, assetId), byLearners)),
  );
}

/** Recordings of the academy's courses that can become videos: they have a picture. */
export async function recordingsForLibrary(db: Database, tenantId: string) {
  return withTenant(db, tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: sources.id,
        title: sources.title,
        status: sources.status,
        courseTitle: courses.title,
        contentType: files.contentType,
        createdAt: sources.createdAt,
      })
      .from(sources)
      .innerJoin(courses, eq(courses.id, sources.courseId))
      .innerJoin(files, eq(files.id, sources.fileId))
      .where(and(eq(sources.kind, "recording"), isNotNull(sources.fileId)))
      .orderBy(desc(sources.createdAt));
    return rows.filter((row) => row.contentType.startsWith("video/"));
  });
}

/** Lessons that show a video: the Studio names them before it is deleted. */
export async function lessonsShowing(db: Database, tenantId: string, assetId: string) {
  if (!UUID.test(assetId)) return [];
  return withTenant(db, tenantId, (tx) =>
    tx
      .select({
        id: lessons.id,
        title: lessons.title,
        locale: lessons.locale,
        courseId: lessons.courseId,
      })
      .from(lessons)
      .where(sql`${lessons.blocks} @> ${JSON.stringify([{ type: "media", assetId }])}::jsonb`),
  );
}

export interface VideoEdit {
  title?: string;
  access?: MediaAccess;
  /** New names for the video's chapters, in order. */
  chapterTitles?: string[];
}

export async function updateVideo(
  db: Database,
  tenantId: string,
  assetId: string,
  edit: VideoEdit,
): Promise<"ok" | "not_found" | "chapters_changed"> {
  return withTenant(db, tenantId, async (tx) => {
    const [asset] = await tx.select().from(mediaAssets).where(eq(mediaAssets.id, assetId));
    if (!asset) return "not_found";
    let chapters = asset.chapters;
    if (edit.chapterTitles) {
      const renamed = renameChapters(asset.chapters, edit.chapterTitles);
      // The transcript may have brought new chapters while the form was open.
      if (!renamed) return "chapters_changed";
      chapters = renamed;
    }
    await tx
      .update(mediaAssets)
      .set({
        ...(edit.title?.trim() ? { title: edit.title.trim().slice(0, 200) } : {}),
        ...(edit.access ? { access: edit.access } : {}),
        chapters,
      })
      .where(eq(mediaAssets.id, assetId));
    return "ok";
  });
}

/**
 * Deletes a video with its renditions, its poster and its uploaded original
 * (a course recording stays with its course). Viewers' progress goes with
 * it; lessons that showed it show nothing in its place.
 */
export async function deleteVideo(
  db: Database,
  tenantId: string,
  assetId: string,
): Promise<boolean> {
  const asset = await loadVideo(db, tenantId, assetId);
  if (!asset) return false;
  // Storage first: if it fails, the video is still whole and the author can try again.
  if (asset.kind === "upload" && storageConfigured()) {
    await deleteUnderPrefix(tenantId, `media/${mediaPrefix(asset.id)}`);
  }
  await withTenant(db, tenantId, (tx) =>
    tx.delete(mediaAssets).where(eq(mediaAssets.id, asset.id)),
  );
  if (asset.fileId) {
    const original = await loadFile(db, tenantId, asset.fileId);
    if (original?.purpose === "video") await deleteFiles(db, tenantId, [original]);
  }
  return true;
}

/** Videos by id for lessons: only this academy's, in one query. */
export async function videosById(
  db: Database,
  tenantId: string,
  ids: readonly string[],
): Promise<Map<string, MediaAsset>> {
  const wanted = [...new Set(ids.filter((id) => UUID.test(id)))];
  if (wanted.length === 0) return new Map();
  const rows = await withTenant(db, tenantId, (tx) =>
    tx.select().from(mediaAssets).where(inArray(mediaAssets.id, wanted)),
  );
  return new Map(rows.map((row) => [row.id, row]));
}

/** A fresh folder name for a transcode run. */
export function newRunId(): string {
  return `r${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}
