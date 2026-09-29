import { describe, expect, it } from "vitest";

import { countTicks, viewersPerMinute, watchSummary } from "@/core/media/retention";

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

  it("puts clean whole-number ticks on the viewer axis", () => {
    expect(countTicks(2)).toEqual([0, 1, 2]);
    expect(countTicks(12)).toEqual([0, 5, 10, 15]);
    expect(countTicks(40)).toEqual([0, 10, 20, 30, 40]);
    expect(countTicks(1234)).toEqual([0, 500, 1000, 1500]);
    expect(countTicks(0)).toEqual([0, 1]);
  });

  it("sums up viewers, those who reached the threshold and the average share", () => {
    const rows = [{ percent: 100 }, { percent: 40 }, { percent: 85 }];
    expect(watchSummary(rows, 80)).toEqual({ viewers: 3, watched: 2, averagePercent: 75 });
    // A stricter academy sees it at once.
    expect(watchSummary(rows, 90).watched).toBe(1);
    expect(watchSummary([], 80)).toEqual({ viewers: 0, watched: 0, averagePercent: 0 });
  });
});
