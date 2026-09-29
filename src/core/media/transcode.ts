/**
 * Uploaded re-lives become HLS (webinar brief §6): renditions up to the
 * source's own size, six-second segments, one master playlist, a poster
 * frame. The worker runs ffmpeg with the arguments built here; nothing is
 * scaled up, so a 720p recording never pretends to be 1080p. Segments are
 * fragmented MP4 (H.264 and AAC): browsers with Media Source Extensions play
 * them without converting each one first, and Safari plays them natively.
 */

export interface VideoProbe {
  durationSec: number;
  /** As displayed, after the rotation phones record in their metadata. */
  width: number;
  height: number;
  hasAudio: boolean;
}

function clock(value: string): number | null {
  const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value.trim());
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : null;
}

/**
 * What `ffmpeg -i <file>` says about its input (the worker image has ffmpeg
 * but not ffprobe). Null when there is no video stream: cover art of an
 * audio file is not a video.
 */
export function parseProbe(ffmpegLog: string): VideoProbe | null {
  const input = ffmpegLog.split(/\nOutput #0/)[0] ?? ffmpegLog;
  const durationSec = clock(/Duration: ([\d:.]+)/.exec(input)?.[1] ?? "");
  const video = input
    .split("\n")
    .find((line) => /Stream #\d+:\d+.*: Video:/.test(line) && !/attached pic/.test(line));
  const size = video ? /, (\d{2,5})x(\d{2,5})[\s,[]/.exec(video) : null;
  if (!size || durationSec === null || !(durationSec > 0)) return null;
  let width = Number(size[1]);
  let height = Number(size[2]);
  // ffmpeg turns rotated recordings upright while it transcodes: measure them upright too.
  const rotation =
    /rotate\s*:\s*(-?\d+)/.exec(input)?.[1] ??
    /rotation of (-?[\d.]+) degrees/.exec(input)?.[1] ??
    "0";
  if (Math.abs(Math.round(Number(rotation))) % 180 === 90) [width, height] = [height, width];
  return {
    durationSec,
    width,
    height,
    hasAudio: /Stream #\d+:\d+.*: Audio:/.test(input),
  };
}

export interface Rendition {
  /** "360p", "720p", "1080p": also the folder of its playlist and segments. */
  name: string;
  width: number;
  height: number;
  videoKbps: number;
  audioKbps: number;
}

/** The rungs, by the short side of the picture (portrait recordings count their width). */
const LADDER = [
  { short: 360, videoKbps: 800, audioKbps: 96 },
  { short: 720, videoKbps: 2800, audioKbps: 128 },
  { short: 1080, videoKbps: 5000, audioKbps: 128 },
] as const;

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

/** Renditions for a source of this size: every rung it reaches, or one at its own size below 360p. */
export function renditionLadder(width: number, height: number): Rendition[] {
  const short = Math.min(width, height);
  const portrait = height > width;
  const rungs = LADDER.filter((rung) => rung.short <= short);
  const chosen = rungs.length > 0 ? rungs : [{ ...LADDER[0], short: even(short) }];
  return chosen.map((rung) => {
    const scale = rung.short / short;
    const size = portrait
      ? { width: rung.short, height: even(height * scale) }
      : { width: even(width * scale), height: rung.short };
    return {
      name: `${rung.short}p`,
      ...size,
      videoKbps: rung.videoKbps,
      audioKbps: rung.audioKbps,
    };
  });
}

export const SEGMENT_SEC = 6;
export const MASTER_PLAYLIST = "master.m3u8";
export const POSTER_FILE = "poster.jpg";

/**
 * One ffmpeg run for every rendition: the source is decoded once and split.
 * Key frames every six seconds in all renditions keep their segments
 * aligned, so players switch quality at any segment boundary.
 */
export function transcodeArgs(input: {
  source: string;
  outputDir: string;
  renditions: readonly Rendition[];
  hasAudio: boolean;
  threads?: number;
}): string[] {
  const { renditions } = input;
  const split = `[0:v]split=${renditions.length}${renditions.map((_, i) => `[v${i}]`).join("")}`;
  const scales = renditions.map(
    (rendition, i) =>
      `[v${i}]scale=${rendition.width}:${rendition.height}:flags=bicubic,format=yuv420p[v${i}out]`,
  );
  const args = ["-y", "-i", input.source, "-filter_complex", [split, ...scales].join(";")];
  renditions.forEach((rendition, i) => {
    args.push(
      "-map",
      `[v${i}out]`,
      `-c:v:${i}`,
      "libx264",
      `-b:v:${i}`,
      `${rendition.videoKbps}k`,
      `-maxrate:v:${i}`,
      `${Math.round(rendition.videoKbps * 1.1)}k`,
      `-bufsize:v:${i}`,
      `${rendition.videoKbps * 2}k`,
    );
    if (input.hasAudio) {
      args.push("-map", "0:a:0", `-c:a:${i}`, "aac", `-b:a:${i}`, `${rendition.audioKbps}k`);
    }
  });
  args.push(
    "-preset",
    "veryfast",
    "-profile:v",
    "main",
    "-force_key_frames",
    `expr:gte(t,n_forced*${SEGMENT_SEC})`,
    "-sc_threshold",
    "0",
    ...(input.hasAudio ? ["-ac", "2", "-ar", "48000"] : []),
    ...(input.threads ? ["-threads", String(input.threads)] : []),
    "-f",
    "hls",
    "-hls_time",
    String(SEGMENT_SEC),
    "-hls_playlist_type",
    "vod",
    "-hls_flags",
    "independent_segments",
    "-hls_segment_type",
    "fmp4",
    // Written next to each rendition's playlist: init_<n>.mp4, or init.mp4 when there is one.
    "-hls_fmp4_init_filename",
    "init.mp4",
    "-hls_segment_filename",
    `${input.outputDir}/%v/seg-%05d.m4s`,
    "-master_pl_name",
    MASTER_PLAYLIST,
    "-var_stream_map",
    renditions
      .map((rendition, i) => `v:${i}${input.hasAudio ? `,a:${i}` : ""},name:${rendition.name}`)
      .join(" "),
    `${input.outputDir}/%v/index.m3u8`,
  );
  return args;
}

/** A frame that shows what the video is about: a tenth in, past title slides, at most 30 s. */
export function posterTime(durationSec: number): number {
  return Math.max(0, Math.min(durationSec * 0.1, 30));
}

/** Files of a transcoded video as the media route serves them. */
const HLS_PATH =
  /^(?:master\.m3u8|poster\.jpg|\d{3,4}p\/(?:index\.m3u8|init(?:_\d{1,2})?\.mp4|seg-\d{5}\.m4s))$/;

export function isHlsPath(path: string): boolean {
  return HLS_PATH.test(path);
}

export function hlsContentType(path: string): string {
  if (path.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (path.endsWith(".m4s")) return "video/iso.segment";
  if (path.endsWith(".mp4")) return "video/mp4";
  if (path.endsWith(".jpg")) return "image/jpeg";
  if (path.endsWith(".vtt")) return "text/vtt; charset=utf-8";
  return "application/octet-stream";
}
