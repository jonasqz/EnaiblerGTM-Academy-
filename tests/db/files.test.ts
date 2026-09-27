import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { files } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import {
  attachFiles,
  cleanupPendingFiles,
  fileBytes,
  loadFile,
  openFile,
  storeFile,
  UploadRejected,
} from "@/server/files";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

/*
 * Needs an S3-compatible endpoint as well (e.g. `moto_server -p 5055`):
 *   TEST_S3_ENDPOINT=http://127.0.0.1:5055
 */
const hasStorage = hasDatabase && Boolean(process.env.TEST_S3_ENDPOINT);

async function read(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function streamOf(bytes: Uint8Array, chunk = 64 * 1024): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(offset, offset + chunk));
      offset += chunk;
    },
  });
}

describe.skipIf(!hasStorage)("stored files", () => {
  let dbs: TestDatabases;
  let tenantId: string;
  let otherTenantId: string;
  let learnerId: string;

  beforeAll(async () => {
    process.env.S3_ENDPOINT = process.env.TEST_S3_ENDPOINT;
    process.env.S3_BUCKET = `enaibler-test-${randomBytes(4).toString("hex")}`;
    process.env.S3_ACCESS_KEY_ID = "test";
    process.env.S3_SECRET_ACCESS_KEY = "test";
    process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL;
    process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-00";
    dbs = await openTestDatabases();
    tenantId = await createTenant(dbs.owner.db);
    otherTenantId = await createTenant(dbs.owner.db);
    learnerId = await createUser(dbs.owner.db);
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("removes camera and location data from photos and applies their orientation", async () => {
    const photo = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "#0f7b6c" },
    })
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Artist: "Jane Doe", Make: "Phone" } } })
      .toBuffer();
    const file = await storeFile(dbs.app.db, tenantId, {
      purpose: "submission",
      body: new Uint8Array(photo),
      name: "IMG_0001.JPG",
      ownerUserId: learnerId,
      status: "pending",
    });
    expect(file).toMatchObject({
      contentType: "image/jpeg",
      status: "pending",
      name: "IMG_0001.jpg",
    });
    expect(file.storageKey).toBe(`tenants/${tenantId}/submissions/${learnerId}/${file.id}.jpg`);
    const stored = await sharp(Buffer.from(await fileBytes(file))).metadata();
    expect(stored.exif).toBeUndefined();
    // Orientation 6 means "rotate 90°": the stored pixels are upright now.
    expect({ width: stored.width, height: stored.height }).toEqual({ width: 20, height: 40 });
  });

  it("removes the author from PDFs but keeps their text", async () => {
    const doc = await PDFDocument.create();
    doc.setAuthor("Jane Doe");
    doc.setCreator("Word");
    doc.addPage([300, 200]).drawText("Validated idea brief", {
      x: 20,
      y: 100,
      size: 12,
      font: await doc.embedFont(StandardFonts.Helvetica),
    });
    const file = await storeFile(dbs.app.db, tenantId, {
      purpose: "submission",
      body: streamOf(await doc.save(), 1024),
      name: "brief.pdf",
      ownerUserId: learnerId,
    });
    const stored = await PDFDocument.load(await fileBytes(file), { updateMetadata: false });
    expect(stored.getAuthor()).toBeUndefined();
    expect(stored.getCreator()).toBeUndefined();
    expect(stored.getPageCount()).toBe(1);
  });

  it("refuses the wrong type, unsafe SVGs and files over the limit", async () => {
    const attempt = (input: Parameters<typeof storeFile>[2]) =>
      storeFile(dbs.app.db, tenantId, input).then(
        () => "stored",
        (error: unknown) => (error instanceof UploadRejected ? error.issue : String(error)),
      );
    const mp4 = new Uint8Array([0, 0, 0, 0x20, ...Buffer.from("ftypisom"), ...randomBytes(64)]);
    expect(
      await attempt({ purpose: "submission", body: mp4, name: "a.mp4", ownerUserId: learnerId }),
    ).toBe("type_not_allowed");
    expect(
      await attempt({
        purpose: "brand_logo",
        body: new TextEncoder().encode('<svg onload="alert(1)"></svg>'),
        name: "logo.svg",
      }),
    ).toBe("invalid_content");
    expect(
      await attempt({
        purpose: "submission",
        body: streamOf(new TextEncoder().encode("# Brief\n".repeat(200_000))),
        name: "brief.md",
        ownerUserId: learnerId,
        maxBytes: 1024 * 1024,
      }),
    ).toBe("too_large");
    // The assignment accepts PDFs only.
    expect(
      await attempt({
        purpose: "submission",
        body: new TextEncoder().encode("# Brief"),
        name: "brief.md",
        ownerUserId: learnerId,
        allowedMimes: ["application/pdf"],
      }),
    ).toBe("type_not_allowed");
  });

  it("streams recordings in parts and serves byte ranges", async () => {
    const video = new Uint8Array(12 * 1024 * 1024);
    video.set([0, 0, 0, 0x20, ...Buffer.from("ftypisom")]);
    video.set(randomBytes(1024), 100);
    const file = await storeFile(dbs.app.db, tenantId, {
      purpose: "source",
      body: streamOf(video, 256 * 1024),
      name: "Screen recording.mp4",
    });
    expect(file).toMatchObject({ contentType: "video/mp4", sizeBytes: video.length });
    const slice = await openFile(file, "bytes=100-1123");
    expect(slice.contentRange).toBe(`bytes 100-1123/${video.length}`);
    expect(Buffer.from(await read(slice.body)).equals(Buffer.from(video.subarray(100, 1124)))).toBe(
      true,
    );
  });

  it("claims pending uploads once, for their owner only, and clears the rest", async () => {
    const upload = () =>
      storeFile(dbs.app.db, tenantId, {
        purpose: "submission",
        body: new TextEncoder().encode("# My brief"),
        name: "brief.md",
        ownerUserId: learnerId,
        status: "pending",
      });
    const claimed = await upload();
    const abandoned = await upload();
    const someoneElse = await createUser(dbs.owner.db);
    await expect(
      withTenant(dbs.app.db, tenantId, (tx) =>
        attachFiles(tx, { ids: [claimed.id], purpose: "submission", ownerUserId: someoneElse }),
      ),
    ).rejects.toThrow(/Unknown or already used/);
    const [attached] = await withTenant(dbs.app.db, tenantId, (tx) =>
      attachFiles(tx, { ids: [claimed.id], purpose: "submission", ownerUserId: learnerId }),
    );
    expect(attached?.status).toBe("attached");

    await withTenant(dbs.owner.db, tenantId, (tx) =>
      tx
        .update(files)
        .set({ createdAt: new Date(Date.now() - 2 * 86_400_000) })
        .where(eq(files.id, abandoned.id)),
    );
    expect(await cleanupPendingFiles(dbs.app.db, tenantId, new Date(Date.now() - 86_400_000))).toBe(
      1,
    );
    expect(await loadFile(dbs.app.db, tenantId, abandoned.id)).toBeNull();
    expect(await loadFile(dbs.app.db, tenantId, claimed.id)).not.toBeNull();
    // Another academy cannot see the file at all.
    expect(await loadFile(dbs.app.db, otherTenantId, claimed.id)).toBeNull();
  });
});
