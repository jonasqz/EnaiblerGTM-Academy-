import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import { and, eq, inArray, lt } from "drizzle-orm";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import sharp from "sharp";

import {
  PURPOSE_RULES,
  safeFileName,
  uploadIssue,
  type FilePurpose,
  type PurposeRule,
  type UploadIssue,
} from "@/core/files/policy";
import { refineTextType, sniffFileType, SNIFF_BYTES, type SniffedType } from "@/core/files/sniff";
import { svgIssue } from "@/core/files/svg";
import { objectKey } from "@/core/storage/keys";
import type { Database, Transaction } from "@/db/client";
import { files } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import {
  deleteObject,
  getObject,
  getObjectBytes,
  putObject,
  putObjectStream,
  type StoredObject,
} from "@/server/storage";

/*
 * The upload pipeline (brief §9, §11). Types come from the content, sizes are
 * enforced while reading, and author metadata is stripped: images are
 * re-encoded (EXIF, GPS and camera data gone, orientation applied), PDFs lose
 * their document info and XMP metadata. Recordings are streamed to storage
 * in parts. Used by the upload route and by the worker (keyframes), so no
 * Next.js imports here.
 */

export type FileRecord = typeof files.$inferSelect;
export type StoreIssue = UploadIssue | "invalid_content";

export class UploadRejected extends Error {
  constructor(
    readonly issue: StoreIssue,
    detail?: string,
  ) {
    super(detail ?? issue);
  }
}

export interface StoreFileInput {
  purpose: FilePurpose;
  body: ReadableStream<Uint8Array> | Uint8Array;
  /** The name the person gave the file; only used, cleaned, for downloads. */
  name: string;
  ownerUserId?: string | null;
  createdBy?: string | null;
  status?: "pending" | "attached";
  /** Narrower limit than the purpose's own (e.g. an assignment's max_mb). */
  maxBytes?: number;
  /** Narrower types than the purpose's own (e.g. an assignment's accepted kinds). */
  allowedMimes?: readonly string[];
}

const PROCESSED_FAMILIES = new Set(["image", "pdf", "svg", "text", "font"]);

function concat(chunks: readonly Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function reader(body: StoreFileInput["body"]): ReadableStreamDefaultReader<Uint8Array> {
  if (body instanceof Uint8Array) {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(body);
        controller.close();
      },
    }).getReader();
  }
  return body.getReader();
}

function decodeStrict(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new UploadRejected("invalid_content", "The text is not UTF-8");
  }
}

async function stripImage(bytes: Uint8Array, type: SniffedType, maxSide = 4096) {
  try {
    const meta = await sharp(bytes, { animated: true }).metadata();
    const animated = (meta.pages ?? 1) > 1;
    let image = sharp(bytes, { animated, limitInputPixels: 100_000_000 });
    // Orientation lives in EXIF, which is about to go: apply it to the pixels first.
    if (!animated) image = image.rotate();
    image = image.resize({
      width: maxSide,
      height: maxSide,
      fit: "inside",
      withoutEnlargement: true,
    });
    const encoded =
      type.mime === "image/jpeg"
        ? image.jpeg({ quality: 88 })
        : type.mime === "image/png"
          ? image.png()
          : type.mime === "image/webp"
            ? image.webp({ quality: 88 })
            : type.mime === "image/gif"
              ? image.gif()
              : image.avif({ quality: 60 });
    return new Uint8Array(await encoded.toBuffer());
  } catch {
    throw new UploadRejected("invalid_content", "The image could not be read");
  }
}

const PDF_INFO_KEYS = ["Title", "Author", "Subject", "Keywords", "Creator", "Producer"];

async function stripPdf(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const infoRef = doc.context.trailerInfo.Info;
    const info = infoRef ? doc.context.lookup(infoRef, PDFDict) : undefined;
    for (const key of PDF_INFO_KEYS) info?.delete(PDFName.of(key));
    doc.catalog.delete(PDFName.of("Metadata"));
    return await doc.save();
  } catch (error) {
    // Encrypted or unusual PDFs: keep them readable rather than refusing the work.
    console.warn("[files] PDF metadata could not be removed; keeping the file as uploaded", error);
    return bytes;
  }
}

async function processBytes(bytes: Uint8Array, type: SniffedType, rule: PurposeRule) {
  switch (type.family) {
    case "image":
      return stripImage(bytes, type, rule.maxImageSide);
    case "pdf":
      return stripPdf(bytes);
    case "svg": {
      const issue = svgIssue(decodeStrict(bytes));
      if (issue) throw new UploadRejected("invalid_content", issue);
      return bytes;
    }
    case "text":
      decodeStrict(bytes);
      return bytes;
    default:
      return bytes;
  }
}

/** Stores an upload after checking and cleaning it; returns the file row. */
export async function storeFile(
  db: Database,
  tenantId: string,
  input: StoreFileInput,
): Promise<FileRecord> {
  const rule = PURPOSE_RULES[input.purpose];
  const limit = Math.min(input.maxBytes ?? rule.maxBytes, rule.maxBytes);
  if (rule.ownerPrefix && !input.ownerUserId)
    throw new Error(`${input.purpose} files need an owner`);

  const source = reader(input.body);
  const head: Uint8Array[] = [];
  let headSize = 0;
  let ended = false;
  while (headSize < SNIFF_BYTES) {
    const next = await source.read();
    if (next.done) {
      ended = true;
      break;
    }
    head.push(next.value);
    headSize += next.value.length;
  }
  const headBytes = concat(head, headSize);
  const sniffed = sniffFileType(headBytes.subarray(0, SNIFF_BYTES));
  const type = sniffed ? refineTextType(sniffed, input.name) : null;
  const issue =
    uploadIssue(input.purpose, type, headSize, limit) ??
    (type && input.allowedMimes && !input.allowedMimes.includes(type.mime)
      ? "type_not_allowed"
      : null);
  if (issue || !type) {
    await source.cancel().catch(() => undefined);
    throw new UploadRejected(issue ?? "unknown_type");
  }

  const id = randomUUID();
  const key = objectKey(
    tenantId,
    rule.area,
    ...(rule.ownerPrefix ? [input.ownerUserId!] : []),
    `${id}.${type.ext}`,
  );
  const hash = createHash("sha256");
  let size = 0;

  if (PROCESSED_FAMILIES.has(type.family)) {
    const chunks = [headBytes];
    size = headSize;
    while (!ended) {
      const next = await source.read();
      if (next.done) break;
      size += next.value.length;
      if (size > limit) {
        await source.cancel().catch(() => undefined);
        throw new UploadRejected("too_large");
      }
      chunks.push(next.value);
    }
    const bytes = await processBytes(concat(chunks, size), type, rule);
    size = bytes.length;
    hash.update(bytes);
    await putObject(tenantId, key, bytes, type.mime);
  } else {
    async function* counted() {
      size = headSize;
      hash.update(headBytes);
      yield headBytes;
      while (!ended) {
        const next = await source.read();
        if (next.done) return;
        size += next.value.length;
        if (size > limit) throw new UploadRejected("too_large");
        hash.update(next.value);
        yield next.value;
      }
    }
    try {
      await putObjectStream(
        tenantId,
        key,
        Readable.from(counted(), { objectMode: false }),
        type.mime,
      );
    } catch (error) {
      await source.cancel().catch(() => undefined);
      throw error;
    }
  }

  try {
    const [record] = await withTenant(db, tenantId, (tx) =>
      tx
        .insert(files)
        .values({
          id,
          tenantId,
          purpose: input.purpose,
          status: input.status ?? "attached",
          storageKey: key,
          contentType: type.mime,
          sizeBytes: size,
          name: safeFileName(input.name, type.ext),
          sha256: hash.digest("hex"),
          ownerUserId: input.ownerUserId ?? null,
          createdBy: input.createdBy ?? null,
          attachedAt: (input.status ?? "attached") === "attached" ? new Date() : null,
        })
        .returning(),
    );
    return record!;
  } catch (error) {
    await deleteObject(tenantId, key).catch(() => undefined);
    throw error;
  }
}

export async function loadFile(
  db: Database,
  tenantId: string,
  fileId: string,
): Promise<FileRecord | null> {
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return null;
  const [record] = await withTenant(db, tenantId, (tx) =>
    tx.select().from(files).where(eq(files.id, fileId)),
  );
  return record ?? null;
}

export function openFile(record: FileRecord, range?: string): Promise<StoredObject> {
  return getObject(record.tenantId, record.storageKey, range);
}

export function fileBytes(record: FileRecord): Promise<Uint8Array> {
  return getObjectBytes(record.tenantId, record.storageKey);
}

/**
 * Claims pending uploads for a form (e.g. a hand-in) inside its transaction.
 * Only the owner's own pending files of that purpose can be claimed.
 */
export async function attachFiles(
  tx: Transaction,
  input: { ids: readonly string[]; purpose: FilePurpose; ownerUserId: string },
): Promise<FileRecord[]> {
  if (input.ids.length === 0) return [];
  const claimed = await tx
    .update(files)
    .set({ status: "attached", attachedAt: new Date() })
    .where(
      and(
        inArray(files.id, [...input.ids]),
        eq(files.purpose, input.purpose),
        eq(files.ownerUserId, input.ownerUserId),
        eq(files.status, "pending"),
      ),
    )
    .returning();
  if (claimed.length !== new Set(input.ids).size) throw new Error("Unknown or already used upload");
  // UPDATE … RETURNING has no order: keep the order the files were given in.
  const position = new Map(input.ids.map((id, index) => [id, index]));
  return claimed.sort((a, b) => position.get(a.id)! - position.get(b.id)!);
}

/** Removes files from storage, then their rows. */
export async function deleteFiles(
  db: Database,
  tenantId: string,
  records: readonly FileRecord[],
): Promise<void> {
  for (const record of records) await deleteObject(tenantId, record.storageKey);
  if (records.length === 0) return;
  await withTenant(db, tenantId, (tx) =>
    tx.delete(files).where(
      inArray(
        files.id,
        records.map((record) => record.id),
      ),
    ),
  );
}

/** Uploads nobody claimed (an abandoned hand-in form): gone after a day. */
export async function cleanupPendingFiles(
  db: Database,
  tenantId: string,
  olderThan: Date,
): Promise<number> {
  const stale = await withTenant(db, tenantId, (tx) =>
    tx
      .select()
      .from(files)
      .where(and(eq(files.status, "pending"), lt(files.createdAt, olderThan))),
  );
  await deleteFiles(db, tenantId, stale);
  return stale.length;
}

/** Relative URL of a stored file on the academy's own domain. */
export function fileUrl(record: Pick<FileRecord, "id">): `/files/${string}` {
  return `/files/${record.id}`;
}
