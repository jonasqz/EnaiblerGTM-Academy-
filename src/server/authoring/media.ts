import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { parseSceneChanges } from "@/core/authoring/transcript";
import { openFile, type FileRecord } from "@/server/files";

/*
 * Recordings in the worker: ffmpeg (installed in the worker image; FFMPEG_PATH
 * overrides the binary) extracts the audio for transcription and the frames
 * for keyframes. Files are copied from storage into a temporary directory
 * that is always removed afterwards.
 */

export function ffmpegPath(): string {
  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

export function runFfmpeg(
  args: readonly string[],
  timeoutMs = 30 * 60_000,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), ["-hide_banner", "-nostdin", ...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      // Scene detection logs a line per frame: keep the tail only.
      if (stderr.length > 4_000_000) stderr = stderr.slice(-2_000_000);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stderr });
    });
  });
}

export interface TempDir {
  path: string;
  cleanup(): Promise<void>;
}

export async function tempDir(prefix = "enaibler-"): Promise<TempDir> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  return { path, cleanup: () => rm(path, { recursive: true, force: true }) };
}

/** Copies a stored file to disk (ffmpeg needs a seekable file for most containers). */
export async function downloadFile(record: FileRecord, target: string): Promise<void> {
  const { body } = await openFile(record);
  await pipeline(
    Readable.fromWeb(body as unknown as NodeReadableStream<Uint8Array>),
    createWriteStream(target),
  );
}

export async function hasVideo(input: string): Promise<boolean> {
  const { stderr } = await runFfmpeg(["-i", input], 60_000);
  return (
    /Stream #\d+:\d+.*: Video:/.test(stderr) && !/Video: (mjpeg|png).*attached pic/.test(stderr)
  );
}

/** Mono 16 kHz audio at 32 kbit/s: about 14 MB per hour, all speech recognition needs. */
export async function extractAudio(input: string, output: string): Promise<void> {
  const result = await runFfmpeg([
    "-y",
    "-i",
    input,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "32k",
    output,
  ]);
  if (result.code !== 0) throw new Error(`ffmpeg audio: ${result.stderr.slice(-500)}`);
}

/** Times (seconds) where the screen changes noticeably: the step changes of a screen recording. */
export async function sceneChanges(input: string, threshold = 0.3): Promise<number[]> {
  const result = await runFfmpeg([
    "-i",
    input,
    "-an",
    "-vf",
    `scale=480:-2,select='gt(scene,${threshold})',showinfo`,
    "-fps_mode",
    "vfr",
    "-f",
    "null",
    "-",
  ]);
  if (result.code !== 0) throw new Error(`ffmpeg scenes: ${result.stderr.slice(-500)}`);
  return parseSceneChanges(result.stderr);
}

/** One JPEG frame at `seconds`, at most 1920 px wide. */
export async function grabFrame(input: string, seconds: number, output: string): Promise<void> {
  const result = await runFfmpeg([
    "-y",
    "-ss",
    seconds.toFixed(2),
    "-i",
    input,
    "-frames:v",
    "1",
    "-vf",
    "scale='min(1920,iw)':-2",
    "-q:v",
    "3",
    output,
  ]);
  if (result.code !== 0) throw new Error(`ffmpeg frame: ${result.stderr.slice(-500)}`);
}
