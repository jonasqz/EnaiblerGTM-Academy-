import { createHash } from "node:crypto";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { recheckDue, sourceChangedReason } from "@/core/authoring/auto-update";
import { JobFailure, jobErrorCode, PERMANENT_JOB_ERRORS } from "@/core/authoring/job-errors";
import { chunkText, readableText } from "@/core/authoring/text";
import type { Locale } from "@/core/i18n/locales";
import type { Database } from "@/db/client";
import { EMBEDDING_DIMENSIONS, files, lessons, sourceChunks, sources } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { usageMeter } from "@/server/ai-usage";
import { embed, embeddingConfig } from "@/server/authoring/speech";
import { safeFetchText, type FetchText } from "@/server/brand/safe-fetch";
import { deleteFiles, fileBytes, loadFile } from "@/server/files";
import type { Enqueue } from "@/server/jobs/producer";
import { QUEUES } from "@/server/jobs/queues";
import { documentText } from "@/server/text-extract";

/*
 * Authoring sources (brief §7, step 2): recordings, documents, web pages and
 * expert interviews. Each ends up as plain text plus chunks for retrieval
 * (with embeddings when an embedding model is configured). Recordings go
 * through transcription first (see recordings.ts).
 */

export type Source = typeof sources.$inferSelect;
export type SourceKind = Source["kind"];

export interface NewSource {
  courseId: string;
  kind: SourceKind;
  title: string;
  locale: Locale | null;
  fileId?: string | null;
  url?: string | null;
  content?: string | null;
  createdBy: string;
}

export async function createSource(
  db: Database,
  tenantId: string,
  input: NewSource,
  enqueue: Enqueue,
): Promise<string> {
  return withTenant(db, tenantId, async (tx) => {
    const [source] = await tx
      .insert(sources)
      .values({
        tenantId,
        courseId: input.courseId,
        kind: input.kind,
        title: input.title.slice(0, 200),
        locale: input.locale,
        fileId: input.fileId ?? null,
        url: input.url ?? null,
        content: input.content ?? null,
        createdBy: input.createdBy,
      })
      .returning({ id: sources.id });
    const id = source!.id;
    if (input.kind === "recording") {
      await enqueue(tx, QUEUES.transcription, { tenantId, sourceId: id }, { id });
    } else {
      await enqueue(tx, QUEUES.sourcesExtract, { tenantId, sourceId: id }, { id });
    }
    return id;
  });
}

export async function listSources(db: Database, tenantId: string, courseId: string) {
  return withTenant(db, tenantId, (tx) =>
    tx
      .select({
        id: sources.id,
        kind: sources.kind,
        status: sources.status,
        title: sources.title,
        url: sources.url,
        error: sources.error,
        createdAt: sources.createdAt,
        changedAt: sources.changedAt,
        checkedAt: sources.checkedAt,
        topics: sources.transcript,
        contentLength: sql<number>`coalesce(length(${sources.content}), 0)::int`,
      })
      .from(sources)
      .where(eq(sources.courseId, courseId))
      .orderBy(desc(sources.createdAt)),
  );
}

export async function loadSource(
  db: Database,
  tenantId: string,
  sourceId: string,
): Promise<Source | null> {
  if (!/^[0-9a-f-]{36}$/i.test(sourceId)) return null;
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx.select().from(sources).where(eq(sources.id, sourceId)),
  );
  return row ?? null;
}

export async function updateSource(
  db: Database,
  tenantId: string,
  sourceId: string,
  patch: Partial<Pick<Source, "status" | "error" | "transcript" | "title">>,
): Promise<void> {
  await withTenant(db, tenantId, (tx) =>
    tx.update(sources).set(patch).where(eq(sources.id, sourceId)),
  );
}

/**
 * Removes a source, its chunks and its files. Screenshots that a lesson
 * already uses were promoted to lesson media and stay.
 */
export async function deleteSource(db: Database, tenantId: string, sourceId: string) {
  const source = await loadSource(db, tenantId, sourceId);
  if (!source) return;
  const fileIds = [
    source.fileId,
    ...(source.transcript ?? []).map((segment) => segment.keyframeFileId),
  ].filter((id): id is string => Boolean(id));
  await withTenant(db, tenantId, async (tx) => {
    await tx.delete(sources).where(eq(sources.id, sourceId));
    // Lessons no longer watch it; a flag it raised stays until someone reviewed the lesson.
    await tx
      .update(lessons)
      .set({ sourceIds: sql`array_remove(${lessons.sourceIds}, ${sourceId}::uuid)` })
      .where(sql`${lessons.sourceIds} @> array[${sourceId}]::uuid[]`);
  });
  if (fileIds.length === 0) return;
  const owned = await withTenant(db, tenantId, (tx) =>
    tx
      .select()
      .from(files)
      .where(and(inArray(files.id, fileIds), inArray(files.purpose, ["source", "keyframe"]))),
  );
  await deleteFiles(db, tenantId, owned);
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text.replace(/\s+/g, " ").trim()).digest("hex");
}

/**
 * Stores the source's text and replaces its chunks (and embeddings). When
 * the text differs from what was stored before, the lessons written from
 * this source are flagged for review (auto-update, brief §7).
 */
export async function storeSourceText(
  db: Database,
  tenantId: string,
  sourceId: string,
  text: string,
): Promise<{ changed: boolean; flagged: number }> {
  const hash = contentHash(text);
  const [before] = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ hash: sources.contentHash, courseId: sources.courseId })
      .from(sources)
      .where(eq(sources.id, sourceId)),
  );
  if (before?.hash === hash) {
    // Same text as last time: nothing to chunk or embed again.
    await withTenant(db, tenantId, (tx) =>
      tx
        .update(sources)
        .set({ checkedAt: new Date(), status: "ready", error: null })
        .where(eq(sources.id, sourceId)),
    );
    return { changed: false, flagged: 0 };
  }
  const chunks = chunkText(text);
  const config = embeddingConfig();
  const vectors = config
    ? await embed(
        config,
        chunks.map((chunk) => chunk.content),
        EMBEDDING_DIMENSIONS,
        usageMeter(db, {
          tenantId,
          kind: "embedding",
          courseId: before?.courseId,
          refId: sourceId,
        }),
      ).catch((error: unknown) => {
        // The month's AI allowance used up included: the source is still read, without vectors.
        console.warn("[authoring] embeddings failed; keyword retrieval only", error);
        return null;
      })
    : null;
  return withTenant(db, tenantId, async (tx) => {
    await tx.delete(sourceChunks).where(eq(sourceChunks.sourceId, sourceId));
    if (chunks.length > 0) {
      await tx.insert(sourceChunks).values(
        chunks.map((chunk, index) => ({
          tenantId,
          sourceId,
          position: chunk.position,
          content: chunk.content,
          embedding: vectors?.[index] ?? null,
        })),
      );
    }
    // The first read is no change; only a different text after that is.
    const changed = Boolean(before?.hash);
    const now = new Date();
    await tx
      .update(sources)
      .set({
        content: text,
        contentHash: hash,
        checkedAt: now,
        ...(changed ? { changedAt: now } : {}),
        status: "ready",
        error: null,
      })
      .where(eq(sources.id, sourceId));
    if (!changed) return { changed, flagged: 0 };
    const flagged = await tx
      .update(lessons)
      .set({ flaggedAt: now, flagReason: sourceChangedReason(sourceId) })
      .where(sql`${lessons.sourceIds} @> array[${sourceId}]::uuid[]`)
      .returning({ id: lessons.id });
    return { changed, flagged: flagged.length };
  });
}

/** The readable text of a web page or document; throws with a message for the author. */
export async function readSourceText(
  db: Database,
  tenantId: string,
  source: Source,
  fetchText: FetchText = safeFetchText,
): Promise<{ text: string; title?: string }> {
  if (source.kind === "interview") return { text: source.content ?? "" };
  if (source.kind === "document") {
    const record = source.fileId ? await loadFile(db, tenantId, source.fileId) : null;
    if (!record) throw new JobFailure("file_missing");
    return { text: await documentText(await fileBytes(record), record.contentType) };
  }
  if (source.kind === "url" && source.url) {
    const page = await fetchText(source.url, {
      accept: /text\/html|application\/xhtml\+xml|text\/plain|text\/markdown/i,
      maxBytes: 3_000_000,
      timeoutMs: 15_000,
    });
    if (!page.ok) {
      throw new JobFailure(
        page.reason === "blocked"
          ? "address_blocked"
          : page.reason === "type"
            ? "not_a_page"
            : "page_unreachable",
      );
    }
    if (/text\/html|xhtml/i.test(page.contentType)) {
      const readable = readableText(page.text);
      return { text: readable.text, title: readable.title ?? undefined };
    }
    return { text: page.text.trim() };
  }
  // Recordings are transcribed (recordings.ts), never read as text.
  throw new JobFailure("read_failed");
}

/** The `sources.extract` job: documents, web pages, interviews. */
export async function extractSource(
  db: Database,
  tenantId: string,
  sourceId: string,
  options: { finalAttempt: boolean; fetchText?: FetchText },
): Promise<void> {
  const source = await loadSource(db, tenantId, sourceId);
  if (!source || source.kind === "recording") return;
  await updateSource(db, tenantId, sourceId, { status: "processing", error: null });
  try {
    const { text, title } = await readSourceText(db, tenantId, source, options.fetchText);
    if (!text.trim()) throw new JobFailure(source.kind === "document" ? "no_text_scan" : "no_text");
    if (title && source.kind === "url" && source.title === source.url) {
      await updateSource(db, tenantId, sourceId, { title: title.slice(0, 200) });
    }
    await storeSourceText(db, tenantId, sourceId, text.slice(0, 400_000));
  } catch (error) {
    const code = jobErrorCode(error, "read_failed");
    if (!options.finalAttempt && !PERMANENT_JOB_ERRORS.has(code)) throw error;
    if (!(error instanceof JobFailure)) console.error("[authoring] reading a source failed", error);
    await updateSource(db, tenantId, sourceId, { status: "failed", error: code });
  }
}

export type RecheckOutcome = "unchanged" | "changed" | "failed" | "skipped";

/** Reads a web page source again (auto-update). A failed read keeps the text read before. */
export async function recheckSource(
  db: Database,
  tenantId: string,
  sourceId: string,
  options: { fetchText?: FetchText } = {},
): Promise<RecheckOutcome> {
  const source = await loadSource(db, tenantId, sourceId);
  if (!source || source.kind !== "url" || source.status !== "ready") return "skipped";
  try {
    const { text } = await readSourceText(db, tenantId, source, options.fetchText);
    if (!text.trim()) throw new JobFailure("no_text");
    const { changed } = await storeSourceText(db, tenantId, sourceId, text.slice(0, 400_000));
    return changed ? "changed" : "unchanged";
  } catch (error) {
    await withTenant(db, tenantId, (tx) =>
      tx
        .update(sources)
        .set({ checkedAt: new Date(), error: jobErrorCode(error, "page_unreachable") })
        .where(eq(sources.id, sourceId)),
    );
    return "failed";
  }
}

/** The daily round of one academy: web pages not read in the last day. */
export async function recheckDueSources(
  db: Database,
  tenantId: string,
  options: { fetchText?: FetchText; now?: Date; limit?: number } = {},
): Promise<Record<RecheckOutcome, number>> {
  const now = options.now ?? new Date();
  const candidates = await withTenant(db, tenantId, (tx) =>
    tx
      .select({
        id: sources.id,
        kind: sources.kind,
        status: sources.status,
        checkedAt: sources.checkedAt,
      })
      .from(sources)
      .where(and(eq(sources.kind, "url"), eq(sources.status, "ready")))
      .orderBy(sql`${sources.checkedAt} asc nulls first`)
      .limit(500),
  );
  const result: Record<RecheckOutcome, number> = {
    unchanged: 0,
    changed: 0,
    failed: 0,
    skipped: 0,
  };
  const due = candidates.filter((row) => recheckDue(row, now)).slice(0, options.limit ?? 100);
  for (const row of due) {
    result[await recheckSource(db, tenantId, row.id, { fetchText: options.fetchText })]++;
  }
  return result;
}
