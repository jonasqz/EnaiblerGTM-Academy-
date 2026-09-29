import type { TimedText } from "@/core/authoring/transcript";

/**
 * Captions and the searchable transcript of a re-live (webinar brief §2.4)
 * come from Whisper's timed segments. Segments can run up to half a minute;
 * captions are cut into short cues a viewer can read, and the same cues make
 * the transcript the player searches and jumps from.
 */

/** A cue on screen: at most this long and this many characters (two lines of about 42). */
export const MAX_CUE_SEC = 7;
export const MAX_CUE_CHARS = 84;

const round = (seconds: number) => Math.round(seconds * 1000) / 1000;

function splitSegment(segment: TimedText, maxSec: number, maxChars: number): TimedText[] {
  const text = segment.text.replace(/\s+/g, " ").trim();
  const span = segment.end - segment.start;
  if (!text || !(span > 0)) return [];
  const pieces = Math.max(Math.ceil(span / maxSec), Math.ceil(text.length / maxChars));
  if (pieces <= 1) return [{ start: segment.start, end: segment.end, text }];
  // Words in groups of about equal length; each cue gets the share of time its characters take.
  const limit = Math.min(maxChars, Math.ceil(text.length / pieces));
  const groups: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    if (current && current.length + 1 + word.length > limit) {
      groups.push(current);
      current = word;
    } else current = current ? `${current} ${word}` : word;
  }
  if (current) groups.push(current);
  const total = groups.reduce((sum, group) => sum + group.length + 1, 0);
  let consumed = 0;
  return groups.map((group) => {
    const start = segment.start + (span * consumed) / total;
    consumed += group.length + 1;
    const end = segment.start + (span * consumed) / total;
    return { start: round(start), end: round(end), text: group };
  });
}

/** Readable cues in order, none overlapping the next. */
export function captionCues(
  segments: readonly TimedText[],
  options: { maxSec?: number; maxChars?: number } = {},
): TimedText[] {
  const cues = [...segments]
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end))
    .sort((a, b) => a.start - b.start)
    .flatMap((segment) =>
      splitSegment(segment, options.maxSec ?? MAX_CUE_SEC, options.maxChars ?? MAX_CUE_CHARS),
    );
  return cues.flatMap((cue, index) => {
    const next = cues[index + 1];
    const end = next ? Math.min(cue.end, next.start) : cue.end;
    return end > cue.start ? [{ ...cue, end: round(end) }] : [];
  });
}

/** 3725.5 → "01:02:05.500" */
export function vttTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 1000));
  const ms = total % 1000;
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60_000) % 60;
  const h = Math.floor(total / 3_600_000);
  const two = (value: number) => String(value).padStart(2, "0");
  return `${two(h)}:${two(m)}:${two(s)}.${String(ms).padStart(3, "0")}`;
}

/** Cue text as WebVTT reads it: markup characters escaped, never an arrow or a blank line. */
function cueText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("--&gt;", "→");
}

/** A WebVTT file of the cues (already cut with captionCues). */
export function toWebVtt(cues: readonly TimedText[]): string {
  const body = cues
    .filter((cue) => cue.end > cue.start && cue.text.trim())
    .map((cue) => `${vttTime(cue.start)} --> ${vttTime(cue.end)}\n${cueText(cue.text)}`);
  return ["WEBVTT", ...body].join("\n\n") + "\n";
}

function parseTime(value: string): number | null {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})$/.exec(value.trim());
  if (!match) return null;
  return (
    Number(match[1] ?? 0) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4]) / 1000
  );
}

/** The cues of a WebVTT file (for the transcript next to the player); settings and tags dropped. */
export function parseWebVtt(source: string): TimedText[] {
  const cues: TimedText[] = [];
  for (const block of source.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    const lines = block.split("\n");
    const timing = lines.findIndex((line) => line.includes("-->"));
    if (timing < 0) continue;
    const [from, rest] = lines[timing]!.split("-->");
    const start = parseTime(from ?? "");
    const end = parseTime((rest ?? "").trim().split(/\s+/)[0] ?? "");
    const text = lines
      .slice(timing + 1)
      .join(" ")
      .replace(/<[^>]*>/g, "")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&nbsp;", " ")
      .replaceAll("&amp;", "&")
      .trim();
    if (start !== null && end !== null && end > start && text) cues.push({ start, end, text });
  }
  return cues;
}

/** Lower case without accents, so "uber" finds "Über". */
export function searchable(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Positions of the cues that contain every word of the query; all of them for an empty query. */
export function searchCues(cues: readonly TimedText[], query: string): number[] {
  const words = searchable(query).split(/\s+/).filter(Boolean);
  return cues.flatMap((cue, index) => {
    const text = searchable(cue.text);
    return words.every((word) => text.includes(word)) ? [index] : [];
  });
}

/** The cue playing at `time`, or -1. */
export function cueAt(cues: readonly TimedText[], time: number): number {
  let low = 0;
  let high = cues.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const cue = cues[middle]!;
    if (time < cue.start) high = middle - 1;
    else if (time >= cue.end) low = middle + 1;
    else return middle;
  }
  return -1;
}
