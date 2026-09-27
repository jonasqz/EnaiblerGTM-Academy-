import { describe, expect, it } from "vitest";

import { jobErrorCode, PERMANENT_JOB_ERRORS } from "@/core/authoring/job-errors";
import {
  AiAllowanceUsedUp,
  allowanceFromColumn,
  allowanceLeft,
  allowanceLevel,
  allowanceResetsAt,
  allowanceStatus,
  allowanceToColumn,
  countedMicroUsd,
  DEFAULT_UNPRICED_CALL_MICRO_USD,
  effectiveAllowance,
  parseAllowance,
  parseAllowanceConfig,
  parseUsd,
  percentUsed,
} from "@/core/usage/allowance";

describe("AI allowance", () => {
  it("reads amounts in US dollars without floating-point drift", () => {
    expect(parseUsd("25")).toBe(25_000_000);
    expect(parseUsd(" 12.50 ")).toBe(12_500_000);
    expect(parseUsd("0.1")).toBe(100_000);
    expect(parseUsd("0.000001")).toBe(1);
    expect(parseUsd("0")).toBe(0);
    for (const bad of ["", "-1", "1e3", "12,50", "$25", "0.0000001", "abc", "1.", ".5"]) {
      expect(parseUsd(bad), bad).toBeNull();
    }
  });

  it("takes the operator's amount, the platform default or no limit", () => {
    expect(parseAllowance("25")).toEqual({ kind: "amount", microUsd: 25_000_000 });
    expect(parseAllowance("0")).toEqual({ kind: "amount", microUsd: 0 });
    expect(parseAllowance(" Default ")).toEqual({ kind: "default" });
    expect(parseAllowance("UNLIMITED")).toEqual({ kind: "unlimited" });
    expect(parseAllowance("lots")).toBeNull();
    expect(parseAllowance("-5")).toBeNull();

    // null is the default and -1 no limit; the column holds nothing else below 0.
    for (const setting of [
      { kind: "default" },
      { kind: "unlimited" },
      { kind: "amount", microUsd: 0 },
      { kind: "amount", microUsd: 25_000_000 },
    ] as const) {
      expect(allowanceFromColumn(allowanceToColumn(setting))).toEqual(setting);
    }
    expect(allowanceToColumn({ kind: "default" })).toBeNull();
    expect(allowanceToColumn({ kind: "unlimited" })).toBe(-1);
    expect(() => allowanceToColumn({ kind: "amount", microUsd: -1 })).toThrow();
    expect(() => allowanceToColumn({ kind: "amount", microUsd: 0.5 })).toThrow();
  });

  it("uses the academy's own allowance, else the platform default", () => {
    expect(effectiveAllowance({ kind: "default" }, 20_000_000)).toBe(20_000_000);
    expect(effectiveAllowance({ kind: "default" }, null)).toBeNull();
    expect(effectiveAllowance({ kind: "unlimited" }, 20_000_000)).toBeNull();
    expect(effectiveAllowance({ kind: "amount", microUsd: 5_000_000 }, 20_000_000)).toBe(5_000_000);
    expect(effectiveAllowance({ kind: "amount", microUsd: 5_000_000 }, null)).toBe(5_000_000);
  });

  it("reads the platform default and the fallback price from the environment", () => {
    expect(parseAllowanceConfig({})).toEqual({
      defaultMicroUsd: null,
      rates: { unpricedCallMicroUsd: DEFAULT_UNPRICED_CALL_MICRO_USD, audioMinuteMicroUsd: 6_000 },
    });
    // docker compose passes unset variables as empty strings.
    expect(
      parseAllowanceConfig({ AI_MONTHLY_ALLOWANCE_USD: "", AI_UNPRICED_CALL_USD: " " }),
    ).toMatchObject({ defaultMicroUsd: null, rates: { unpricedCallMicroUsd: 50_000 } });
    expect(
      parseAllowanceConfig({ AI_MONTHLY_ALLOWANCE_USD: "20", AI_UNPRICED_CALL_USD: "0.02" }),
    ).toMatchObject({ defaultMicroUsd: 20_000_000, rates: { unpricedCallMicroUsd: 20_000 } });
    expect(() => parseAllowanceConfig({ AI_MONTHLY_ALLOWANCE_USD: "twenty" })).toThrow(
      /AI_MONTHLY_ALLOWANCE_USD/,
    );
    expect(() => parseAllowanceConfig({ AI_UNPRICED_CALL_USD: "-0.01" })).toThrow(
      /AI_UNPRICED_CALL_USD/,
    );
  });

  it("counts calls without a price at the fallback and audio by the minute", () => {
    const rates = { unpricedCallMicroUsd: 50_000, audioMinuteMicroUsd: 6_000 };
    expect(
      countedMicroUsd({ pricedMicroUsd: 0, unpricedCalls: 0, unpricedAudioSeconds: 0 }, rates),
    ).toBe(0);
    // $0.0561 reported, two calls the gateway could not price, 5.2 minutes on our own Whisper.
    expect(
      countedMicroUsd(
        { pricedMicroUsd: 56_090, unpricedCalls: 2, unpricedAudioSeconds: 312 },
        rates,
      ),
    ).toBe(56_090 + 100_000 + 31_200);
    expect(
      countedMicroUsd({ pricedMicroUsd: 0, unpricedCalls: 0, unpricedAudioSeconds: 1 }, rates),
    ).toBe(100);
  });

  it("admits calls while the month's spend is below the allowance", () => {
    expect(allowanceLeft(1_000_000_000, null)).toBe(true);
    expect(allowanceLeft(4_999_999, 5_000_000)).toBe(true);
    expect(allowanceLeft(5_000_000, 5_000_000)).toBe(false);
    expect(allowanceLeft(5_300_000, 5_000_000)).toBe(false);
    // An allowance of 0 keeps the academy's AI off.
    expect(allowanceLeft(0, 0)).toBe(false);
  });

  it("warns from 80 % and calls it used up at 100 %", () => {
    expect(percentUsed(0, 5_000_000)).toBe(0);
    expect(percentUsed(3_999_999, 5_000_000)).toBe(79);
    expect(percentUsed(4_999_999, 5_000_000)).toBe(99);
    expect(percentUsed(5_200_000, 5_000_000)).toBe(104);
    expect(percentUsed(0, 0)).toBe(100);
    expect(allowanceLevel(3_999_999, 5_000_000)).toBe("ok");
    expect(allowanceLevel(4_000_000, 5_000_000)).toBe("warning");
    expect(allowanceLevel(4_999_999, 5_000_000)).toBe("warning");
    expect(allowanceLevel(5_000_000, 5_000_000)).toBe("used_up");
    expect(allowanceLevel(0, 0)).toBe("used_up");
  });

  it("starts again with each calendar month in Berlin", () => {
    expect(allowanceResetsAt(new Date("2026-09-30T21:59:00Z"))).toEqual(
      new Date("2026-09-30T22:00:00Z"),
    );
    expect(allowanceResetsAt(new Date("2026-09-30T22:00:00Z"))).toEqual(
      new Date("2026-10-31T23:00:00Z"),
    );
  });

  it("sums up an academy's month for the Studio and the operator", () => {
    expect(
      allowanceStatus({
        month: "2026-09",
        setting: { kind: "default" },
        platformDefaultMicroUsd: 20_000_000,
        spentMicroUsd: 17_000_000,
      }),
    ).toEqual({
      month: "2026-09",
      setting: { kind: "default" },
      allowanceMicroUsd: 20_000_000,
      spentMicroUsd: 17_000_000,
      percentUsed: 85,
      level: "warning",
      resetsAt: new Date("2026-09-30T22:00:00Z"),
    });
    expect(
      allowanceStatus({
        month: "2026-09",
        setting: { kind: "unlimited" },
        platformDefaultMicroUsd: 20_000_000,
        spentMicroUsd: 90_000_000,
      }),
    ).toMatchObject({ allowanceMicroUsd: null, percentUsed: null, level: null });
  });

  it("stops a job for good when the allowance is used up", () => {
    const error = new AiAllowanceUsedUp();
    expect(jobErrorCode(error, "gateway_failed")).toBe("ai_allowance_used_up");
    expect(PERMANENT_JOB_ERRORS.has("ai_allowance_used_up")).toBe(true);
  });
});
