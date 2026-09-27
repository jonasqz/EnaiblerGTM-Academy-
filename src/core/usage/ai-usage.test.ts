import { describe, expect, it } from "vitest";

import {
  addUsage,
  emptyTotals,
  monthRange,
  toMicroUsd,
  usageGroupOf,
  usageMonth,
} from "@/core/usage/ai-usage";

describe("AI usage", () => {
  it("groups kinds, converts costs and adds up what is known", () => {
    expect(usageGroupOf("review")).toBe("review");
    expect(usageGroupOf("lesson_draft")).toBe("authoring");
    expect(usageGroupOf("brand_import")).toBe("setup");
    expect(toMicroUsd(0.0038)).toBe(3800);
    expect(toMicroUsd(null)).toBeNull();
    expect(toMicroUsd(Number.NaN)).toBeNull();
    const totals = emptyTotals();
    addUsage(totals, {
      calls: 1,
      tokensIn: 1000,
      tokensOut: 200,
      audioSeconds: null,
      costMicroUsd: 3800,
    });
    addUsage(totals, {
      calls: 2,
      tokensIn: null,
      tokensOut: null,
      audioSeconds: 90,
      costMicroUsd: null,
    });
    expect(totals).toEqual({
      calls: 3,
      tokensIn: 1000,
      tokensOut: 200,
      audioSeconds: 90,
      costMicroUsd: 3800,
      costIncomplete: true,
    });
  });

  it("counts by calendar month in Berlin", () => {
    expect(usageMonth(new Date("2026-09-30T21:59:00Z"))).toBe("2026-09");
    expect(usageMonth(new Date("2026-09-30T22:00:00Z"))).toBe("2026-10");
    expect(monthRange("2026-10")).toEqual({
      from: new Date("2026-09-30T22:00:00Z"),
      to: new Date("2026-10-31T23:00:00Z"),
    });
    expect(monthRange("2026-12").to).toEqual(new Date("2026-12-31T23:00:00Z"));
    expect(() => monthRange("2026-13")).toThrow();
  });
});
