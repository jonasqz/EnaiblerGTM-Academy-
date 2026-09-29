import { describe, expect, it } from "vitest";

import {
  effectiveQuota,
  formatGb,
  parseGb,
  parseQuota,
  parseQuotaDefault,
  quotaAdmits,
  quotaFromColumn,
  quotaPercent,
  quotaStatus,
  quotaToColumn,
} from "@/core/media/quota";

const GB = 1_000_000_000;

describe("video storage quota", () => {
  it("reads gigabytes without floating-point drift", () => {
    expect(parseGb("50")).toBe(50 * GB);
    expect(parseGb(" 2.5 ")).toBe(2_500_000_000);
    expect(parseGb("0.001")).toBe(1_000_000);
    expect(parseGb("0")).toBe(0);
    for (const bad of ["", "-1", "1e3", "2,5", "0.0001", "lots", "1."]) {
      expect(parseGb(bad), bad).toBeNull();
    }
  });

  it("takes the operator's amount, the platform default or no limit", () => {
    expect(parseQuota("20")).toEqual({ kind: "amount", bytes: 20 * GB });
    expect(parseQuota("Default")).toEqual({ kind: "default" });
    expect(parseQuota(" unlimited ")).toEqual({ kind: "unlimited" });
    expect(parseQuota("-5")).toBeNull();
    for (const setting of [
      { kind: "default" },
      { kind: "unlimited" },
      { kind: "amount", bytes: 0 },
      { kind: "amount", bytes: 20 * GB },
    ] as const) {
      expect(quotaFromColumn(quotaToColumn(setting))).toEqual(setting);
    }
    expect(() => quotaToColumn({ kind: "amount", bytes: -1 })).toThrow();
  });

  it("falls back to the platform default, which may be no limit", () => {
    expect(parseQuotaDefault(undefined)).toBeNull();
    expect(parseQuotaDefault(" ")).toBeNull();
    expect(parseQuotaDefault("100")).toBe(100 * GB);
    expect(() => parseQuotaDefault("100GB")).toThrow(/gigabytes/);
    expect(effectiveQuota({ kind: "default" }, 10 * GB)).toBe(10 * GB);
    expect(effectiveQuota({ kind: "default" }, null)).toBeNull();
    expect(effectiveQuota({ kind: "unlimited" }, 10 * GB)).toBeNull();
    expect(effectiveQuota({ kind: "amount", bytes: 5 }, null)).toBe(5);
  });

  it("admits what still fits and refuses what does not", () => {
    expect(quotaAdmits(9 * GB, GB, 10 * GB)).toBe(true);
    expect(quotaAdmits(9 * GB, GB + 1, 10 * GB)).toBe(false);
    expect(quotaAdmits(20 * GB, GB, null)).toBe(true);
    expect(quotaAdmits(0, 1, 0)).toBe(false);
  });

  it("shows the share used, warning from 80 %", () => {
    expect(quotaPercent(GB, 4 * GB)).toBe(25);
    expect(quotaPercent(0, 0)).toBe(100);
    expect(
      quotaStatus({
        setting: { kind: "default" },
        platformDefaultBytes: 10 * GB,
        usedBytes: 8 * GB,
      }),
    ).toMatchObject({ quotaBytes: 10 * GB, percentUsed: 80, level: "warning" });
    expect(
      quotaStatus({
        setting: { kind: "amount", bytes: GB },
        platformDefaultBytes: null,
        usedBytes: 2 * GB,
      }),
    ).toMatchObject({ percentUsed: 200, level: "full" });
    expect(
      quotaStatus({ setting: { kind: "unlimited" }, platformDefaultBytes: GB, usedBytes: 5 * GB }),
    ).toMatchObject({ quotaBytes: null, percentUsed: null, level: null });
    expect(formatGb(1_250_000_000)).toBe("1.25 GB");
  });
});
