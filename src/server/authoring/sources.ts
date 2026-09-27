import { createHash } from "node:crypto";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { chunkText, readableText } from "@/core/authoring/text";
import type { Locale } from "@/core/i18n/locales";
import type { Database } from "@/db/client";
import { EMBEDDING_DIMENSIONS, files, sourceChunks, sources } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
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
  await withTenant(db, tenantId, (tx) => tx.delete(sources).where(eq(sources.id, sourceId)));
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
 * Stores the source's text and replaces its chunks (and embeddings). Returns
 * whether the text differs from what was stored before.
 */
export async function storeSourceText(
  db: Database,
  tenantId: string,
  sourceId: string,
  text: string,
): Promise<{ changed: boolean }> {
  const chunks = chunkText(text);
  const config = embeddingConfig();
  const vectors = config
    ? await embed(
        config,
        chunks.map((chunk) => chunk.content),
        EMBEDDING_DIMENSIONS,
      ).catch((error: unknown) => {
        console.warn("[authoring] embeddings failed; keyword retrieval only", error);
        return null;
      })
    : null;
  const hash = contentHash(text);
  return withTenant(db, tenantId, async (tx) => {
    const [before] = await tx
      .select({ hash: sources.contentHash })
      .from(sources)
      .where(eq(sources.id, sourceId));
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
    const changed = before?.hash !== null && before?.hash !== undefined && before.hash !== hash;
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
    return { changed };
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
    if (!record) throw new Error("The document is missing.");
    return { text: await documentText(await fileBytes(record), record.contentType) };
  }
  if (source.kind === "url" && source.url) {
    const page = await fetchText(source.url, {
      accept: /text\/html|application\/xhtml\+xml|text\/plain|text\/markdown/i,
      maxBytes: 3_000_000,
      timeoutMs: 15_000,
    });
    if (!page.ok) {
      throw new Error(
        page.reason === "blocked"
          ? "This address cannot be read from our servers."
          : page.reason === "type"
            ? "This address does not return a web page."
            : "The page could not be loaded.",
      );
    }
    if (/text\/html|xhtml/i.test(page.contentType)) {
      const readable = readableText(page.text);
      return { text: readable.text, title: readable.title ?? undefined };
    }
    return { text: page.text.trim() };
  }
  throw new Error("Recordings are transcribed, not read.");
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
    if (!text.trim()) {
      throw new Error(
        source.kind === "document"
          ? "No readable text: the PDF may be a scan."
          : "No readable text found.",
      );
    }
    if (title && source.kind === "url" && source.title === source.url) {
      await updateSource(db, tenantId, sourceId, { title: title.slice(0, 200) });
    }
    await storeSourceText(db, tenantId, sourceId, text.slice(0, 400_000));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reading the source failed.";
    if (
      !options.finalAttempt &&
      !/cannot be read|No readable|missing|does not return/.test(message)
    ) {
      throw error;
    }
    await updateSource(db, tenantId, sourceId, { status: "failed", error: message.slice(0, 300) });
  }
}
