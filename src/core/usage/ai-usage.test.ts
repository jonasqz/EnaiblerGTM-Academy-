import { describe, expect, it } from "vitest";

import {
  addUsage,
  emptyTotals,
  isUsageMonth,
  mergeTotals,
  midMonth,
  monthRange,
  recentMonths,
  shiftMonth,
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

  it("steps through months and names each one in every time zone", () => {
    expect(isUsageMonth("2026-09")).toBe(true);
    expect(isUsageMonth("2026-9")).toBe(false);
    expect(isUsageMonth(null)).toBe(false);
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", 2)).toBe("2027-01");
    expect(shiftMonth("2026-09", -12)).toBe("2025-09");
    expect(recentMonths("2026-02", 3)).toEqual(["2026-02", "2026-01", "2025-12"]);
    // The furthest zones ahead of and behind UTC still see the same month.
    for (const zone of ["Pacific/Kiritimati", "Pacific/Pago_Pago", "Europe/Berlin"]) {
      expect(usageMonth(midMonth("2026-01"), zone)).toBe("2026-01");
    }
    expect(() => shiftMonth("September", 1)).toThrow();
  });

  it("merges totals and keeps a missing price visible", () => {
    const totals = mergeTotals(
      { ...emptyTotals(), calls: 2, tokensIn: 500, costMicroUsd: 1000 },
      { ...emptyTotals(), calls: 1, audioSeconds: 60, costIncomplete: true },
    );
    expect(totals).toEqual({
      calls: 3,
      tokensIn: 500,
      tokensOut: 0,
      audioSeconds: 60,
      costMicroUsd: 1000,
      costIncomplete: true,
    });
    expect(mergeTotals(totals, emptyTotals()).costIncomplete).toBe(true);
  });
});
