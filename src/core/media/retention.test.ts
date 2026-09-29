import { describe, expect, it } from "vitest";

import { viewersPerMinute, watchSummary } from "@/core/media/retention";

describe("drop-off by minute", () => {
  it("counts a viewer for each minute they watched at least half of", () => {
    const counts = viewersPerMinute(
      [
        [[0, 180]], // three whole minutes
        [[0, 90]], // the first, and half of the second
        [[100, 130]], // a third of the second minute: not watched
        [
          [0, 20],
          [150, 180],
        ], // a third of the first, half of the third
      ],
      180,
    );
    expect(counts).toEqual([2, 2, 2]);
  });

  it("asks half of what the last, shorter minute has", () => {
    // 2:30 long: the last minute is 30 seconds, so 15 of them count.
    expect(viewersPerMinute([[[130, 145]], [[130, 140]]], 150)).toEqual([0, 0, 1]);
  });

  it("has nothing to show without a length", () => {
    expect(viewersPerMinute([[[0, 10]]], 0)).toEqual([]);
    expect(viewersPerMinute([], 125)).toEqual([0, 0, 0]);
  });

  it("sums up viewers, those who reached the threshold and the average share", () => {
    expect(
      watchSummary([
        { percent: 100, thresholdReached: true },
        { percent: 40, thresholdReached: false },
        { percent: 85, thresholdReached: true },
      ]),
    ).toEqual({ viewers: 3, watched: 2, averagePercent: 75 });
    expect(watchSummary([])).toEqual({ viewers: 0, watched: 0, averagePercent: 0 });
  });
});
