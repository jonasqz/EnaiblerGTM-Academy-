/**
 * Watch tracking (webinar brief §2.4): the seconds of a video a viewer
 * actually played, not the furthest position they reached, so "watched"
 * means watched. A range is [start, end] in seconds; lists are kept sorted
 * and merged, and a video counts as watched once its ranges cover the
 * academy's threshold (default 80 %).
 */
export type WatchRange = readonly [start: number, end: number];

/** Gaps up to this long are closed: player timers tick about four times a second. */
export const MERGE_GAP_SEC = 1;

/** Ranges within this distance of either end of the video reach it: players stop just short. */
export const EDGE_SEC = 1;

export const DEFAULT_WATCHED_PERCENT = 80;

const isFiniteRange = (range: WatchRange) =>
  Number.isFinite(range[0]) && Number.isFinite(range[1]) && range[1] > range[0];

/** Sorted, overlapping and nearly touching ranges joined; empty and invalid ones dropped. */
export function mergeRanges(
  ranges: readonly WatchRange[],
  gapSec: number = MERGE_GAP_SEC,
): WatchRange[] {
  const sorted = ranges.filter(isFiniteRange).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of sorted) {
    const last = merged.at(-1);
    if (last && start <= last[1] + gapSec) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** Ranges inside the video: cut at both ends, and stretched to an end they almost reach. */
export function clampRanges(ranges: readonly WatchRange[], durationSec: number): WatchRange[] {
  if (!(durationSec > 0)) return [];
  const clamped = ranges.filter(isFiniteRange).map(([start, end]): WatchRange => {
    const from = start <= EDGE_SEC ? 0 : Math.max(0, start);
    const to = end >= durationSec - EDGE_SEC ? durationSec : Math.min(durationSec, end);
    return [from, to];
  });
  return mergeRanges(clamped);
}

/** Seconds covered by the ranges, each second counted once. */
export function watchedSeconds(ranges: readonly WatchRange[]): number {
  return mergeRanges(ranges).reduce((sum, [start, end]) => sum + (end - start), 0);
}

/** Whole percent of the video covered, rounded down: 100 only when every part was played. */
export function percentWatched(ranges: readonly WatchRange[], durationSec: number): number {
  if (!(durationSec > 0)) return 0;
  const watched = watchedSeconds(clampRanges(ranges, durationSec));
  return Math.min(100, Math.floor((watched * 100) / durationSec + 1e-9));
}

/** Whether the ranges cover the academy's share of the video. */
export function reachesThreshold(
  ranges: readonly WatchRange[],
  durationSec: number,
  thresholdPercent: number,
): boolean {
  if (!(durationSec > 0)) return false;
  const watched = watchedSeconds(clampRanges(ranges, durationSec));
  return watched * 100 >= thresholdPercent * durationSec - 1e-6;
}

export interface ProgressUpdate {
  ranges: WatchRange[];
  watchedSec: number;
  percent: number;
  /** True only for the report that first covers the threshold: "watched" is recorded once. */
  crossedThreshold: boolean;
}

/**
 * Adds what a viewer reports to what is stored. Reports carry every range of
 * the page view, so a repeated or late report changes nothing: the union is
 * the same.
 */
export function applyReport(
  stored: readonly WatchRange[],
  reported: readonly WatchRange[],
  durationSec: number,
  thresholdPercent: number,
  alreadyReached: boolean,
): ProgressUpdate {
  const ranges = clampRanges([...stored, ...reported], durationSec);
  const reached = reachesThreshold(ranges, durationSec, thresholdPercent);
  return {
    ranges,
    watchedSec: Math.round(watchedSeconds(ranges) * 10) / 10,
    percent: percentWatched(ranges, durationSec),
    crossedThreshold: reached && !alreadyReached,
  };
}

/** What the player posts: its ranges of this page view, where it is, and (embeds) the length. */
export interface ProgressReport {
  asset: string;
  ranges: Array<[number, number]>;
  position?: number;
  /** Only used for external embeds, whose length only their player knows. */
  duration?: number;
}

/**
 * Follows a player while it plays. Each position while playing extends the
 * current range when it moved forward by a normal step; a seek, a stall or a
 * jump starts a new one, so skipped parts never count.
 */
export function createRangeTracker(maxStepSec = 3) {
  let last: number | null = null;
  let ranges: WatchRange[] = [];
  let changed = false;
  return {
    /** A position while the video plays, at `rate` times normal speed. */
    tick(time: number, rate = 1): void {
      if (!Number.isFinite(time)) return;
      const step = time - (last ?? Number.NaN);
      if (step > 0 && step <= maxStepSec * Math.max(1, rate)) {
        ranges = mergeRanges([...ranges, [last!, time]]);
        changed = true;
      }
      last = time;
    },
    /** A seek or anything else that moved the position: the next tick starts over from here. */
    jump(time: number | null = null): void {
      last = time !== null && Number.isFinite(time) ? time : null;
    },
    /** Every range of this page view, merged. */
    ranges: (): WatchRange[] => ranges,
    /** True once since the last call when something new was watched: time to report. */
    takeChanged(): boolean {
      const was = changed;
      changed = false;
      return was;
    },
  };
}
export type RangeTracker = ReturnType<typeof createRangeTracker>;
