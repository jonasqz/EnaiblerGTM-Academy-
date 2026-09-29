import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { and, eq } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { viewersPerMinute } from "@/core/media/retention";
import { isHlsPath } from "@/core/media/transcode";
import type { TenantContext } from "@/core/tenant/context";
import { validateTenantManifest } from "@/core/tenant/manifest";
import {
  aiUsage,
  events,
  files,
  lessons,
  mediaAssets,
  memberships,
  sources,
  watchProgress,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { applyTenantManifest, findTenantById } from "@/db/tenants";
import { transcribeRecording } from "@/server/authoring/recordings";
import { createSource, loadSource } from "@/server/authoring/sources";
import { storeFile } from "@/server/files";
import type { Enqueue } from "@/server/jobs/producer";
import {
  createEmbeddedVideo,
  createUploadedVideo,
  createVideoFromRecording,
  deleteVideo,
  lessonsShowing,
  listVideos,
  loadVideo,
  mediaKey,
  updateVideo,
  watchRows,
} from "@/server/media/library";
import { progressOf, recordProgress } from "@/server/media/progress";
import {
  admitMediaBytes,
  mediaQuotaStatus,
  readMediaQuota,
  setMediaQuota,
} from "@/server/media/quota";
import { transcodeVideo } from "@/server/media/transcode";
import { transcribeVideo } from "@/server/media/transcribe";
import { exportAcademy } from "@/server/operator/academies";
import { deleteMyData, exportMyData } from "@/server/profile";
import { getObjectBytes, listUnderPrefix } from "@/server/storage";
import { createCourse } from "@/server/studio/courses";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  testManifest,
  uniqueSlug,
  type TestDatabases,
} from "./helpers";

/* The transcoding part needs TEST_S3_ENDPOINT (see files.test.ts) and ffmpeg (FFMPEG_PATH). */
const hasStorage = hasDatabase && Boolean(process.env.TEST_S3_ENDPOINT);
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const hasFfmpeg = spawnSync(ffmpeg, ["-version"]).status === 0;

const GB = 1_000_000_000;

/** An academy whose videos count as watched at half. */
async function academyWatchingAtHalf(db: TestDatabases["owner"]["db"]): Promise<TenantContext> {
  const manifest = testManifest(uniqueSlug("media"));
  manifest.tenant.video = { watched_percent: 50 };
  const result = validateTenantManifest(manifest);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  const { tenantId } = await applyTenantManifest(db, result.manifest);
  return (await findTenantById(db, tenantId))!;
}

async function readyVideo(
  db: TestDatabases["app"]["db"],
  tenantId: string,
  values: Partial<typeof mediaAssets.$inferInsert> = {},
): Promise<string> {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .insert(mediaAssets)
      .values({
        tenantId,
        kind: "upload",
        status: "ready",
        title: "Pricing pages that convert",
        hlsRun: "rtest000001",
        durationSec: 600,
        ...values,
      })
      .returning({ id: mediaAssets.id }),
  );
  return row!.id;
}

describe.skipIf(!hasDatabase)("media library: access and watch tracking", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let other: TenantContext;
  let learner: string;
  let author: string;
  const member = (userId: string) => ({ userId, member: true, canEditCourses: false });

  beforeAll(async () => {
    dbs = await openTestDatabases();
    tenant = await academyWatchingAtHalf(dbs.owner.db);
    other = (await findTenantById(dbs.owner.db, await createTenant(dbs.owner.db)))!;
    learner = await createUser(dbs.owner.db);
    author = await createUser(dbs.owner.db);
    await withTenant(dbs.owner.db, tenant.id, (tx) =>
      tx.insert(memberships).values([
        { tenantId: tenant.id, userId: learner, role: "learner" },
        { tenantId: tenant.id, userId: author, role: "author" },
      ]),
    );
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("keeps each academy's videos and progress to itself", async () => {
    const video = await readyVideo(dbs.app.db, tenant.id);
    const seenByOther = await withTenant(dbs.app.db, other.id, (tx) =>
      tx.select().from(mediaAssets).where(eq(mediaAssets.id, video)),
    );
    expect(seenByOther).toEqual([]);
    expect(await loadVideo(dbs.app.db, other.id, video)).toBeNull();
    // Progress in one academy can never point at another academy's video.
    await expect(
      withTenant(dbs.app.db, other.id, (tx) =>
        tx.insert(watchProgress).values({ tenantId: other.id, assetId: video, userId: learner }),
      ),
    ).rejects.toThrow();
  });

  it("merges what was played, and records start and watched once each", async () => {
    const video = await readyVideo(dbs.app.db, tenant.id);
    const first = await recordProgress(dbs.app.db, tenant, member(learner), {
      asset: video,
      ranges: [[0, 120]],
      position: 120,
    });
    expect(first).toEqual({ percent: 20, watched: false, positionSec: 120 });
    // The same ranges again (a repeated beacon), then more of the video, out of order.
    await recordProgress(dbs.app.db, tenant, member(learner), { asset: video, ranges: [[0, 120]] });
    const second = await recordProgress(dbs.app.db, tenant, member(learner), {
      asset: video,
      ranges: [
        [400, 600],
        [100, 200],
      ],
      position: 600,
    });
    // 0–200 and 400–600: two thirds, past this academy's 50 %.
    expect(second).toMatchObject({ percent: 66, watched: true });
    await recordProgress(dbs.app.db, tenant, member(learner), {
      asset: video,
      ranges: [[200, 400]],
    });

    const [row] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(watchProgress).where(eq(watchProgress.assetId, video)),
    );
    expect(row).toMatchObject({ ranges: [[0, 600]], watchedSec: 600, percent: 100 });
    expect(row?.thresholdReachedAt).toBeInstanceOf(Date);

    const recorded = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .select({ name: events.name, props: events.props })
        .from(events)
        .where(eq(events.userId, learner)),
    );
    const forVideo = recorded.filter((event) => event.props.asset_id === video);
    expect(forVideo.map((event) => event.name).sort()).toEqual(["video_started", "video_watched"]);
    expect(forVideo.find((event) => event.name === "video_watched")?.props.percent).toBe(66);

    expect((await progressOf(dbs.app.db, tenant.id, learner, [video])).get(video)).toEqual({
      percent: 100,
      positionSec: 600,
      watched: true,
    });
  });

  it("tracks only signed-in members who may watch the video", async () => {
    const forLearners = await readyVideo(dbs.app.db, tenant.id);
    const report = { asset: forLearners, ranges: [[0, 60]] as Array<[number, number]> };
    const stranger = await createUser(dbs.owner.db);
    expect(
      await recordProgress(
        dbs.app.db,
        tenant,
        { userId: stranger, member: false, canEditCourses: false },
        report,
      ),
    ).toBeNull();
    const processing = await readyVideo(dbs.app.db, tenant.id, { status: "processing" });
    expect(
      await recordProgress(dbs.app.db, tenant, member(learner), { ...report, asset: processing }),
    ).toBeNull();
    // Another academy's learner cannot report on this academy's video.
    expect(await recordProgress(dbs.app.db, other, member(learner), report)).toBeNull();
    const rows = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(watchProgress).where(eq(watchProgress.assetId, forLearners)),
    );
    expect(rows).toEqual([]);
  });

  it("measures embeds against the length their player reports", async () => {
    const created = await createEmbeddedVideo(dbs.app.db, tenant.id, {
      url: "https://youtu.be/dQw4w9WgXcQ",
      title: "",
      locale: "en",
      createdBy: author,
    });
    if (!created.ok) throw new Error(created.issue);
    const video = await loadVideo(dbs.app.db, tenant.id, created.id);
    expect(video).toMatchObject({
      kind: "external_embed",
      status: "ready",
      embed: { provider: "youtube", id: "dQw4w9WgXcQ" },
    });
    // Without a length there is nothing to measure yet, but the start counts.
    expect(
      await recordProgress(dbs.app.db, tenant, member(learner), {
        asset: created.id,
        ranges: [[0, 5]],
      }),
    ).toMatchObject({ percent: 0, watched: false });
    expect(
      await recordProgress(dbs.app.db, tenant, member(learner), {
        asset: created.id,
        ranges: [[0, 100]],
        duration: 200,
      }),
    ).toMatchObject({ percent: 50, watched: true });
    expect(
      await createEmbeddedVideo(dbs.app.db, tenant.id, {
        url: "https://example.com/video.mp4",
        title: "Elsewhere",
        locale: null,
        createdBy: author,
      }),
    ).toEqual({ ok: false, issue: "invalid_url" });
  });

  it("shows drop-off by minute from learners only", async () => {
    const video = await readyVideo(dbs.app.db, tenant.id, { durationSec: 180 });
    const second = await createUser(dbs.owner.db);
    await withTenant(dbs.owner.db, tenant.id, (tx) =>
      tx.insert(memberships).values({ tenantId: tenant.id, userId: second, role: "learner" }),
    );
    await recordProgress(dbs.app.db, tenant, member(learner), { asset: video, ranges: [[0, 180]] });
    await recordProgress(dbs.app.db, tenant, member(second), { asset: video, ranges: [[0, 70]] });
    // The author previewing it is no audience.
    await recordProgress(
      dbs.app.db,
      tenant,
      { userId: author, member: true, canEditCourses: true },
      {
        asset: video,
        ranges: [[0, 180]],
      },
    );
    const rows = await watchRows(dbs.app.db, tenant.id, video);
    expect(rows).toHaveLength(2);
    expect(
      viewersPerMinute(
        rows.map((row) => row.ranges),
        180,
      ),
    ).toEqual([2, 1, 1]);
    const library = await listVideos(dbs.app.db, tenant.id);
    expect(library.find((row) => row.id === video)?.viewers).toBe(2);
  });

  it("renames chapters without moving them, and changes access", async () => {
    const video = await readyVideo(dbs.app.db, tenant.id, {
      chapters: [
        { startSec: 0, title: "" },
        { startSec: 60, title: "Pricing" },
      ],
    });
    expect(
      await updateVideo(dbs.app.db, tenant.id, video, {
        title: "Re-live: pricing",
        access: "public",
        chapterTitles: ["Welcome", "Pricing pages"],
      }),
    ).toBe("ok");
    expect(await loadVideo(dbs.app.db, tenant.id, video)).toMatchObject({
      title: "Re-live: pricing",
      access: "public",
      chapters: [
        { startSec: 0, title: "Welcome" },
        { startSec: 60, title: "Pricing pages" },
      ],
    });
    expect(await updateVideo(dbs.app.db, tenant.id, video, { chapterTitles: ["One"] })).toBe(
      "chapters_changed",
    );
  });

  it("counts originals and renditions against the operator's storage quota", async () => {
    const academy = (await findTenantById(dbs.owner.db, await createTenant(dbs.owner.db)))!;
    await readyVideo(dbs.app.db, academy.id, { hlsBytes: 3 * GB });
    await withTenant(dbs.app.db, academy.id, (tx) =>
      tx.insert(files).values({
        tenantId: academy.id,
        purpose: "video",
        storageKey: `tenants/${academy.id}/media/${randomBytes(8).toString("hex")}.mp4`,
        contentType: "video/mp4",
        sizeBytes: 2 * GB,
        name: "webinar.mp4",
        sha256: "0".repeat(64),
      }),
    );
    expect((await mediaQuotaStatus(dbs.app.db, academy.id)).usedBytes).toBe(5 * GB);

    const saved = process.env.MEDIA_STORAGE_QUOTA_GB;
    try {
      delete process.env.MEDIA_STORAGE_QUOTA_GB;
      expect(await admitMediaBytes(dbs.app.db, academy.id, 100 * GB)).toBe(true);
      process.env.MEDIA_STORAGE_QUOTA_GB = "6";
      expect(await admitMediaBytes(dbs.app.db, academy.id, GB)).toBe(true);
      expect(await admitMediaBytes(dbs.app.db, academy.id, GB + 1)).toBe(false);
      expect(await readMediaQuota(dbs.owner.db, academy.slug)).toMatchObject({
        setting: { kind: "default" },
        quotaBytes: 6 * GB,
        percentUsed: 83,
        level: "warning",
      });
      // The operator gives this academy more, then no limit, then the default again.
      await setMediaQuota(dbs.owner.db, academy.slug, { kind: "amount", bytes: 20 * GB });
      expect(await admitMediaBytes(dbs.app.db, academy.id, 10 * GB)).toBe(true);
      await setMediaQuota(dbs.owner.db, academy.slug, { kind: "unlimited" });
      expect((await readMediaQuota(dbs.owner.db, academy.slug))?.quotaBytes).toBeNull();
      await setMediaQuota(dbs.owner.db, academy.slug, { kind: "default" });
      expect(await admitMediaBytes(dbs.app.db, academy.id, 2 * GB)).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.MEDIA_STORAGE_QUOTA_GB;
      else process.env.MEDIA_STORAGE_QUOTA_GB = saved;
    }
    expect(await readMediaQuota(dbs.owner.db, "no-such-academy")).toBeNull();
  });

  it("hands learners their watch history and deletes it with their data", async () => {
    const leaving = await createUser(dbs.owner.db);
    await withTenant(dbs.owner.db, tenant.id, (tx) =>
      tx.insert(memberships).values({ tenantId: tenant.id, userId: leaving, role: "learner" }),
    );
    const video = await readyVideo(dbs.app.db, tenant.id);
    await recordProgress(dbs.app.db, tenant, member(leaving), { asset: video, ranges: [[0, 30]] });
    const exported = await exportMyData(dbs.app.db, tenant, leaving);
    expect(exported.videos).toEqual([
      expect.objectContaining({
        video: "Pricing pages that convert",
        percent: 5,
        watchedSeconds: 30,
      }),
    ]);
    await deleteMyData(dbs.app.db, tenant, leaving);
    const left = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(watchProgress).where(eq(watchProgress.userId, leaving)),
    );
    expect(left).toEqual([]);
  });
});

describe.skipIf(!hasStorage || !hasFfmpeg)("media library: transcoding and captions", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let author: string;
  let workDir: string;
  let whisper: Server;
  let whisperUrl: string;
  const jobs: Array<{ name: string; data: unknown; id?: string }> = [];
  const enqueue: Enqueue = async (_tx, name, data, options) => {
    jobs.push({ name, data, id: options?.id });
  };

  /** A few seconds of test picture and tone: small enough for a test, real enough for ffmpeg. */
  function tinyVideo(name: string, seconds = 4): Uint8Array {
    const target = join(workDir, name);
    const result = spawnSync(ffmpeg, [
      "-hide_banner",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=640x360:rate=25",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-t",
      String(seconds),
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-c:a",
      "aac",
      "-shortest",
      target,
    ]);
    if (result.status !== 0) throw new Error(result.stderr.toString());
    return new Uint8Array(readFileSync(target));
  }

  async function keysOf(assetId: string): Promise<string[]> {
    const keys: string[] = [];
    for await (const key of listUnderPrefix(tenant.id, `media/${assetId}/`)) keys.push(key);
    return keys;
  }

  beforeAll(async () => {
    process.env.S3_ENDPOINT = process.env.TEST_S3_ENDPOINT;
    process.env.S3_BUCKET = `enaibler-test-${randomBytes(4).toString("hex")}`;
    process.env.S3_ACCESS_KEY_ID = "test";
    process.env.S3_SECRET_ACCESS_KEY = "test";
    dbs = await openTestDatabases();
    tenant = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    author = await createUser(dbs.owner.db);
    workDir = mkdtempSync(join(tmpdir(), "enaibler-media-test-"));
    whisper = createServer((request, response) => {
      request.resume();
      request.on("end", () => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            text: "…",
            duration: 4,
            segments: [
              { start: 0, end: 1.8, text: " Welcome to the re-live." },
              { start: 1.8, end: 4, text: " Today: pricing pages & <tests>." },
            ],
          }),
        );
      });
    });
    await new Promise<void>((resolve) => whisper.listen(0, "127.0.0.1", resolve));
    whisperUrl = `http://127.0.0.1:${(whisper.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    whisper?.close();
    rmSync(workDir, { recursive: true, force: true });
    await dbs?.close();
  });

  it("transcodes an upload to HLS renditions and a poster, and a retry replaces the run", async () => {
    const upload = await storeFile(dbs.app.db, tenant.id, {
      purpose: "video",
      body: tinyVideo("upload.mp4"),
      name: "Webinar recording.mp4",
      ownerUserId: author,
      createdBy: author,
      status: "pending",
    });
    const created = await createUploadedVideo(
      dbs.app.db,
      tenant.id,
      { fileId: upload.id, title: "", locale: "en", createdBy: author },
      enqueue,
    );
    if (!created.ok) throw new Error(created.issue);
    expect(jobs.filter((job) => (job.data as { assetId?: string }).assetId === created.id)).toEqual(
      [
        {
          name: "media.transcode",
          data: { tenantId: tenant.id, assetId: created.id },
          id: created.id,
        },
        {
          name: "media.transcribe",
          data: { tenantId: tenant.id, assetId: created.id },
          id: undefined,
        },
      ],
    );
    // Claimed for the academy: no longer the uploader's pending file.
    const [claimed] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(files).where(eq(files.id, upload.id)),
    );
    expect(claimed).toMatchObject({ status: "attached", ownerUserId: null });
    expect(
      await createUploadedVideo(
        dbs.app.db,
        tenant.id,
        { fileId: upload.id, title: "Again", locale: "en", createdBy: author },
        enqueue,
      ),
    ).toEqual({ ok: false, issue: "in_use" });

    await transcodeVideo(dbs.app.db, tenant.id, created.id, { finalAttempt: false });
    const ready = await loadVideo(dbs.app.db, tenant.id, created.id);
    expect(ready).toMatchObject({
      status: "ready",
      title: "Webinar recording",
      width: 640,
      height: 360,
      renditions: [{ name: "360p", width: 640, height: 360 }],
    });
    expect(ready?.durationSec).toBeCloseTo(4, 0);
    expect(ready?.hlsBytes).toBeGreaterThan(10_000);
    const run = ready!.hlsRun!;
    const master = new TextDecoder().decode(
      await getObjectBytes(tenant.id, mediaKey(tenant.id, created.id, run, "master.m3u8")),
    );
    expect(master).toContain("#EXT-X-STREAM-INF");
    expect(master).toContain("360p/index.m3u8");
    const playlist = new TextDecoder().decode(
      await getObjectBytes(tenant.id, mediaKey(tenant.id, created.id, run, "360p/index.m3u8")),
    );
    expect(playlist).toContain("#EXT-X-PLAYLIST-TYPE:VOD");
    expect(playlist).toContain('#EXT-X-MAP:URI="init.mp4"');
    expect(playlist).toContain("seg-00000.m4s");
    const keys = await keysOf(created.id);
    expect(keys.some((key) => key.endsWith(`${run}/poster.jpg`))).toBe(true);
    expect(keys.some((key) => key.endsWith(`${run}/360p/seg-00000.m4s`))).toBe(true);
    // Every file the transcode writes is one the media route serves.
    for (const key of keys) expect(isHlsPath(key.split(`/${run}/`)[1] ?? ""), key).toBe(true);

    // pg-boss retries: the second run takes over and the first one's files go.
    await transcodeVideo(dbs.app.db, tenant.id, created.id, { finalAttempt: false });
    const again = await loadVideo(dbs.app.db, tenant.id, created.id);
    expect(again?.hlsRun).not.toBe(run);
    const after = await keysOf(created.id);
    expect(after.length).toBe(keys.length);
    expect(after.every((key) => key.includes(`/${again!.hlsRun}/`))).toBe(true);

    await transcribeVideo(dbs.app.db, tenant.id, created.id, {
      whisper: { baseUrl: whisperUrl, model: "fake-whisper" },
      model: null,
      finalAttempt: true,
    });
    const captioned = await loadVideo(dbs.app.db, tenant.id, created.id);
    expect(captioned).toMatchObject({
      transcriptStatus: "ready",
      transcript: [
        { start: 0, end: 1.8, text: "Welcome to the re-live." },
        { start: 1.8, end: 4, text: "Today: pricing pages & <tests>." },
      ],
    });
    const usage = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(aiUsage).where(eq(aiUsage.refId, created.id)),
    );
    expect(usage).toMatchObject([{ kind: "transcription", audioSeconds: 4 }]);

    // Deleting the video removes every file it had, and its original.
    expect(await deleteVideo(dbs.app.db, tenant.id, created.id)).toBe(true);
    expect(await keysOf(created.id)).toEqual([]);
    const gone = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(files).where(eq(files.id, upload.id)),
    );
    expect(gone).toEqual([]);
  });

  it("fails cleanly on a file that is not a video", async () => {
    const upload = await storeFile(dbs.app.db, tenant.id, {
      purpose: "video",
      // An MP4 header with nothing playable behind it.
      body: new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypisom"), 0, 0, 0, 0]),
      name: "broken.mp4",
      ownerUserId: author,
      createdBy: author,
      status: "pending",
    });
    const created = await createUploadedVideo(
      dbs.app.db,
      tenant.id,
      { fileId: upload.id, title: "Broken", locale: null, createdBy: author },
      enqueue,
    );
    if (!created.ok) throw new Error(created.issue);
    await transcodeVideo(dbs.app.db, tenant.id, created.id, { finalAttempt: false });
    expect(await loadVideo(dbs.app.db, tenant.id, created.id)).toMatchObject({
      status: "failed",
      error: "no_video",
    });
    expect(await keysOf(created.id)).toEqual([]);
  });

  it("makes a video of a course recording with its transcript and topics", async () => {
    const courseId = await createCourse(dbs.app.db, tenant.id, {
      languages: ["en"],
      title: "Pricing pages",
      artifactName: "Pricing page",
      outcome: "Rewrite your pricing page.",
      deliveryMode: "free_async",
    });
    const recording = await storeFile(dbs.app.db, tenant.id, {
      purpose: "source",
      body: tinyVideo("recording.mp4"),
      name: "screen.mp4",
      createdBy: author,
    });
    const sourceId = await createSource(
      dbs.app.db,
      tenant.id,
      {
        courseId,
        kind: "recording",
        title: "Screen recording",
        fileId: recording.id,
        locale: "en",
        createdBy: author,
      },
      enqueue,
    );
    expect(
      await createVideoFromRecording(
        dbs.app.db,
        tenant.id,
        { sourceId, createdBy: author },
        enqueue,
      ),
    ).toEqual({ ok: false, issue: "not_ready" });

    await transcribeRecording(dbs.app.db, tenant.id, sourceId, {
      whisper: { baseUrl: whisperUrl, model: "fake-whisper" },
      model: null,
      next: async () => undefined,
      finalAttempt: true,
    });
    const source = await loadSource(dbs.app.db, tenant.id, sourceId);
    // The recording keeps Whisper's own segments next to its topics.
    expect(source?.segments).toHaveLength(2);
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .update(sources)
        .set({
          status: "ready",
          transcript: [
            { startSec: 0, endSec: 60, title: "Why pricing pages fail", text: "…" },
            { startSec: 60, endSec: 120, title: "What to test first", text: "…" },
          ],
        })
        .where(eq(sources.id, sourceId)),
    );

    const created = await createVideoFromRecording(
      dbs.app.db,
      tenant.id,
      { sourceId, createdBy: author },
      enqueue,
    );
    if (!created.ok) throw new Error(created.issue);
    expect(await loadVideo(dbs.app.db, tenant.id, created.id)).toMatchObject({
      title: "Screen recording",
      sourceId,
      fileId: null,
      transcriptStatus: "ready",
      transcript: source!.segments,
      chapters: [
        { startSec: 0, title: "Why pricing pages fail" },
        { startSec: 60, title: "What to test first" },
      ],
    });
    // No second transcription: only the transcode is queued.
    expect(jobs.filter((job) => (job.data as { assetId?: string }).assetId === created.id)).toEqual(
      [
        {
          name: "media.transcode",
          data: { tenantId: tenant.id, assetId: created.id },
          id: created.id,
        },
      ],
    );
    await transcodeVideo(dbs.app.db, tenant.id, created.id, { finalAttempt: true });
    expect(await loadVideo(dbs.app.db, tenant.id, created.id)).toMatchObject({ status: "ready" });

    // A lesson that shows it is found before the video is deleted; the recording stays.
    await withTenant(dbs.app.db, tenant.id, async (tx) => {
      await tx.insert(lessons).values({
        tenantId: tenant.id,
        courseId,
        locale: "en",
        key: "re-live",
        position: 0,
        title: "The re-live",
        blocks: [
          { type: "media", assetId: created.id },
          { type: "markdown", markdown: "" },
        ],
      });
    });
    expect(
      (await lessonsShowing(dbs.app.db, tenant.id, created.id)).map((row) => row.title),
    ).toEqual(["The re-live"]);
    await deleteVideo(dbs.app.db, tenant.id, created.id);
    expect(await loadSource(dbs.app.db, tenant.id, sourceId)).not.toBeNull();
    const [kept] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .select()
        .from(files)
        .where(and(eq(files.id, recording.id), eq(files.purpose, "source"))),
    );
    expect(kept).toBeDefined();
  });

  it("exports the media library with the academy", async () => {
    const created = await createEmbeddedVideo(dbs.app.db, tenant.id, {
      url: "https://vimeo.com/76979871",
      title: "Vimeo re-live",
      locale: "en",
      createdBy: author,
    });
    if (!created.ok) throw new Error(created.issue);
    const target = join(workDir, "export.zip");
    await exportAcademy(dbs.owner.db, tenant.id, target, { withFiles: false });
    const zip = unzipSync(new Uint8Array(readFileSync(target)));
    const assets = JSON.parse(strFromU8(zip["data/media_assets.json"]!)) as Array<{ id: string }>;
    expect(assets.map((row) => row.id)).toContain(created.id);
    expect(zip["data/watch_progress.json"]).toBeDefined();
  });
});
