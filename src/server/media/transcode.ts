import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { JobFailure, PERMANENT_JOB_ERRORS, type JobError } from "@/core/authoring/job-errors";
import type { MediaError } from "@/core/media/access";
import {
  hlsContentType,
  parseProbe,
  POSTER_FILE,
  posterTime,
  renditionLadder,
  transcodeArgs,
  type VideoProbe,
} from "@/core/media/transcode";
import { tenantPrefix } from "@/core/storage/keys";
import type { Database } from "@/db/client";
import { downloadFile, grabFrame, runFfmpeg, tempDir } from "@/server/authoring/media";
import {
  loadVideo,
  mediaKey,
  mediaPrefix,
  newRunId,
  originalOf,
  updateVideoRow,
} from "@/server/media/library";
import { deleteUnderPrefix, listUnderPrefix, putObject } from "@/server/storage";

/*
 * The `media.transcode` job (webinar brief §6): an uploaded video, or a
 * course recording, becomes HLS renditions and a poster in object storage.
 * Each run writes its own folder and the video switches to it only when
 * everything is stored, so a retry never serves half a transcode; folders of
 * earlier runs are removed afterwards. Runs on its own queue, one at a time,
 * so reviews on the other queues stay fast.
 */

/** Gives up on a video with a code the Studio words. */
export class MediaFailure extends Error {
  constructor(readonly code: MediaError) {
    super(code);
    this.name = "MediaFailure";
  }
}

export async function probeVideo(path: string): Promise<VideoProbe | null> {
  const { stderr } = await runFfmpeg(["-i", path], 60_000);
  return parseProbe(stderr);
}

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)));
}

/** Stores a run's files a few at a time; returns their total size. */
async function storeRun(
  tenantId: string,
  assetId: string,
  run: string,
  dir: string,
): Promise<number> {
  const paths = await filesUnder(dir);
  let bytes = 0;
  let next = 0;
  const worker = async () => {
    while (next < paths.length) {
      const path = paths[next++]!;
      const body = new Uint8Array(await readFile(join(dir, path)));
      bytes += body.length;
      await putObject(tenantId, mediaKey(tenantId, assetId, run, path), body, hlsContentType(path));
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return bytes;
}

/** Folders of runs other than `keep` (earlier transcodes, abandoned attempts). */
async function otherRuns(tenantId: string, assetId: string, keep: string | null) {
  const base = `${tenantPrefix(tenantId)}media/${mediaPrefix(assetId)}`;
  const runs = new Set<string>();
  for await (const key of listUnderPrefix(tenantId, `media/${mediaPrefix(assetId)}`)) {
    const run = key.slice(base.length).split("/")[0];
    if (run && run !== keep) runs.add(run);
  }
  return [...runs];
}

export async function transcodeVideo(
  db: Database,
  tenantId: string,
  assetId: string,
  options: { finalAttempt: boolean; threads?: number },
): Promise<void> {
  const asset = await loadVideo(db, tenantId, assetId);
  if (!asset || asset.kind !== "upload") return;
  const original = await originalOf(db, tenantId, asset);
  if (!original) {
    await updateVideoRow(db, tenantId, assetId, {
      status: "failed",
      error: asset.sourceId ? "source_missing" : "file_missing",
    });
    return;
  }
  const run = newRunId();
  const dir = await tempDir("enaibler-media-");
  try {
    const input = join(dir.path, `original.${original.contentType.split("/")[1] ?? "bin"}`);
    await downloadFile(original, input);
    const probe = await probeVideo(input);
    if (!probe) throw new MediaFailure("no_video");

    const output = join(dir.path, "hls");
    const renditions = renditionLadder(probe.width, probe.height);
    const result = await runFfmpeg(
      transcodeArgs({
        source: input,
        outputDir: output,
        renditions,
        hasAudio: probe.hasAudio,
        threads: options.threads,
      }),
      4 * 60 * 60_000,
    );
    if (result.code !== 0) throw new Error(`ffmpeg transcode: ${result.stderr.slice(-800)}`);
    await grabFrame(input, posterTime(probe.durationSec), join(output, POSTER_FILE));
    const bytes = await storeRun(tenantId, assetId, run, output);

    // Deleted while it was transcoding: nothing may stay behind in storage.
    if (!(await loadVideo(db, tenantId, assetId))) {
      await deleteUnderPrefix(tenantId, `media/${mediaPrefix(assetId)}`);
      return;
    }
    await updateVideoRow(db, tenantId, assetId, {
      status: "ready",
      error: null,
      hlsRun: run,
      hlsBytes: bytes,
      renditions,
      durationSec: Math.round(probe.durationSec * 1000) / 1000,
      width: probe.width,
      height: probe.height,
      readyAt: new Date(),
    });
    for (const old of await otherRuns(tenantId, assetId, run)) {
      await deleteUnderPrefix(tenantId, `media/${mediaPrefix(assetId)}${old}/`);
    }
  } catch (error) {
    // This run's files are never served; the next attempt writes a folder of its own.
    await deleteUnderPrefix(tenantId, `media/${mediaPrefix(assetId)}${run}/`).catch(() => 0);
    const code: MediaError | JobError =
      error instanceof MediaFailure || error instanceof JobFailure
        ? error.code
        : "transcode_failed";
    const permanent =
      error instanceof MediaFailure ||
      (error instanceof JobFailure && PERMANENT_JOB_ERRORS.has(code as JobError));
    if (!options.finalAttempt && !permanent) throw error;
    console.error("[media] transcoding failed", error);
    // A video that already plays keeps its earlier renditions.
    const current = await loadVideo(db, tenantId, assetId);
    if (current && current.status !== "ready") {
      await updateVideoRow(db, tenantId, assetId, { status: "failed", error: code });
    }
  } finally {
    await dir.cleanup();
  }
}
