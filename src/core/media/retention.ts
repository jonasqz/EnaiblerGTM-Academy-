import { clampRanges, type WatchRange } from "@/core/media/ranges";

/**
 * Re-live drop-off by minute (webinar brief §3): for each minute of a video,
 * how many of its viewers watched it. A viewer counts for a minute once they
 * played at least half of it, so scrubbing past does not count, and the
 * last, shorter minute asks for half of what it has.
 */
export function viewersPerMinute(
  viewers: ReadonlyArray<readonly WatchRange[]>,
  durationSec: number,
): number[] {
  if (!(durationSec > 0)) return [];
  const minutes = Math.ceil(durationSec / 60);
  const counts = new Array<number>(minutes).fill(0);
  const covered = new Array<number>(minutes);
  for (const ranges of viewers) {
    covered.fill(0);
    for (const [start, end] of clampRanges(ranges, durationSec)) {
      for (let minute = Math.floor(start / 60); minute < minutes && minute * 60 < end; minute++) {
        const from = Math.max(start, minute * 60);
        const to = Math.min(end, (minute + 1) * 60);
        if (to > from) covered[minute]! += to - from;
      }
    }
    for (let minute = 0; minute < minutes; minute++) {
      const length = Math.min(60, durationSec - minute * 60);
      if (covered[minute]! >= length / 2) counts[minute]! += 1;
    }
  }
  return counts;
}

export interface WatchSummary {
  /** Signed-in viewers who pressed play. */
  viewers: number;
  /** Of them, the ones whose watching reached the academy's threshold. */
  watched: number;
  /** Average share of the video they played, whole percent. */
  averagePercent: number;
}

export function watchSummary(
  rows: ReadonlyArray<{ percent: number; thresholdReached: boolean }>,
): WatchSummary {
  if (rows.length === 0) return { viewers: 0, watched: 0, averagePercent: 0 };
  return {
    viewers: rows.length,
    watched: rows.filter((row) => row.thresholdReached).length,
    averagePercent: Math.round(rows.reduce((sum, row) => sum + row.percent, 0) / rows.length),
  };
}
