import { describe, expect, it } from "vitest";

import {
  applyReport,
  clampRanges,
  createRangeTracker,
  mergeRanges,
  percentWatched,
  reachesThreshold,
  watchedSeconds,
} from "@/core/media/ranges";
import { progressReportSchema } from "@/core/media/report";

describe("watched ranges", () => {
  it("merges overlapping and nearly touching ranges, in order", () => {
    expect(
      mergeRanges([
        [30, 40],
        [0, 10],
        [9, 20],
        [20.5, 25],
        [50, 50],
        [60, 55],
        [Number.NaN, 3],
      ]),
    ).toEqual([
      [0, 25],
      [30, 40],
    ]);
    expect(mergeRanges([])).toEqual([]);
  });

  it("counts every second once, however often it was played", () => {
    expect(
      watchedSeconds([
        [0, 60],
        [30, 90],
        [0, 60],
      ]),
    ).toBe(90);
  });

  it("keeps ranges inside the video and reaches ends the player stops just short of", () => {
    expect(
      clampRanges(
        [
          [0.4, 50],
          [100, 119.6],
          [200, 300],
        ],
        120,
      ),
    ).toEqual([
      [0, 50],
      [100, 120],
    ]);
    expect(clampRanges([[0, 10]], 0)).toEqual([]);
  });

  it("measures what was played, not how far the viewer got", () => {
    // Jumped to the end and watched the last minute of ten: 10 %, not 100 %.
    expect(percentWatched([[540, 600]], 600)).toBe(10);
    expect(percentWatched([[0, 599.5]], 600)).toBe(100);
    expect(percentWatched([[0, 479]], 600)).toBe(79);
    expect(percentWatched([[0, 10]], 0)).toBe(0);
  });

  it("reaches the academy's threshold only with enough of the video played", () => {
    expect(reachesThreshold([[0, 480]], 600, 80)).toBe(true);
    expect(reachesThreshold([[0, 479]], 600, 80)).toBe(false);
    expect(
      reachesThreshold(
        [
          [0, 240],
          [300, 540],
        ],
        600,
        80,
      ),
    ).toBe(true);
    expect(reachesThreshold([[0, 599.2]], 600, 100)).toBe(true);
  });

  it("records the crossing once, and a repeated report changes nothing", () => {
    const first = applyReport([], [[0, 300]], 600, 80, false);
    expect(first).toMatchObject({ watchedSec: 300, percent: 50, crossedThreshold: false });
    const second = applyReport(first.ranges, [[250, 500]], 600, 80, false);
    expect(second).toMatchObject({ percent: 83, crossedThreshold: true });
    // The same report again, after the crossing was recorded.
    const again = applyReport(second.ranges, [[250, 500]], 600, 80, true);
    expect(again.ranges).toEqual(second.ranges);
    expect(again.crossedThreshold).toBe(false);
  });

  it("reads the player's report strictly", () => {
    const asset = "7f1c2e9a-1b2c-4d5e-8f90-123456789abc";
    expect(
      progressReportSchema.safeParse({ asset, ranges: [[0, 12.5]], position: 12.5 }).success,
    ).toBe(true);
    for (const bad of [
      { asset, ranges: [[-1, 5]] },
      { asset, ranges: [[0, 1e9]] },
      { asset, ranges: [[0, 5, 6]] },
      { asset: "nope", ranges: [] },
      { asset, ranges: [], extra: true },
      { asset, ranges: Array.from({ length: 501 }, () => [0, 1]) },
    ]) {
      expect(progressReportSchema.safeParse(bad).success, JSON.stringify(bad).slice(0, 60)).toBe(
        false,
      );
    }
  });
});

describe("range tracker", () => {
  it("extends a range while the video plays and starts a new one after a seek", () => {
    const tracker = createRangeTracker();
    for (let time = 0; time <= 10; time += 0.25) tracker.tick(time);
    tracker.jump(60);
    for (let time = 60; time <= 65; time += 0.25) tracker.tick(time);
    expect(tracker.ranges()).toEqual([
      [0, 10],
      [60, 65],
    ]);
    expect(tracker.takeChanged()).toBe(true);
    expect(tracker.takeChanged()).toBe(false);
  });

  it("never counts a jump forward or backward as watched", () => {
    const tracker = createRangeTracker();
    tracker.tick(0);
    tracker.tick(1);
    tracker.tick(40); // skipped ahead without a seek event
    tracker.tick(41);
    tracker.tick(5); // went back
    tracker.tick(6);
    expect(tracker.ranges()).toEqual([
      [0, 1],
      [5, 6],
      [40, 41],
    ]);
  });

  it("allows bigger steps at higher speed and resumes after a pause at the same spot", () => {
    const tracker = createRangeTracker();
    tracker.tick(0, 2);
    tracker.tick(5, 2);
    tracker.jump(null);
    tracker.tick(5);
    tracker.tick(6);
    expect(tracker.ranges()).toEqual([[0, 6]]);
  });
});
