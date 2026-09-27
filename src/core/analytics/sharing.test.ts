import { describe, expect, it } from "vitest";

import {
  byChannel,
  overviewPeriod,
  percentOf,
  periodWindow,
  summarizeSharing,
  viaSharedCredentials,
} from "@/core/analytics/sharing";

describe("sharing numbers (brief §14)", () => {
  it("offers a few periods and falls back to 30 days", () => {
    expect(overviewPeriod("7")).toBe(7);
    expect(overviewPeriod(["90", "7"])).toBe(90);
    expect(overviewPeriod("365")).toBe(30);
    expect(overviewPeriod(undefined)).toBe(30);
    expect(overviewPeriod("7; drop table")).toBe(30);
    const now = new Date("2026-09-27T12:00:00Z");
    expect(periodWindow(7, now)).toEqual({ from: new Date("2026-09-20T12:00:00Z"), to: now });
  });

  it("counts visits by the LinkedIn channel they came from", () => {
    expect(
      byChannel([
        { key: "post", n: 5 },
        { key: "profile", n: 2 },
        { key: null, n: 3 },
        // Anything else someone typed into the address counts as another way in.
        { key: "newsletter", n: 1 },
      ]),
    ).toEqual({ post: 5, profile: 2, other: 4, total: 11 });
    expect(byChannel([])).toEqual({ post: 0, profile: 0, other: 0, total: 0 });
  });

  it("finds entries that came through a shared certificate", () => {
    expect(
      viaSharedCredentials([
        { source: "linkedin", medium: "post", n: 2 },
        { source: "linkedin", medium: "profile", n: 1 },
        { source: "verification", medium: "credential", n: 4 },
        // LinkedIn ads or the academy's own posts are not a learner's certificate.
        { source: "linkedin", medium: "cpc", n: 7 },
        { source: "newsletter", medium: "email", n: 3 },
        { source: null, medium: null, n: 9 },
      ]),
    ).toBe(7);
  });

  it("gives rates only when there is something to compare with", () => {
    expect(percentOf(2, 3)).toBe(67);
    expect(percentOf(0, 4)).toBe(0);
    expect(percentOf(3, 0)).toBeNull();
  });

  it("sums up a period", () => {
    expect(
      summarizeSharing({
        issued: 8,
        madePublic: 6,
        shares: [
          { key: "post", n: 3 },
          { key: "profile", n: 2 },
        ],
        views: [
          { key: "post", n: 30 },
          { key: "profile", n: 8 },
          { key: null, n: 2 },
        ],
        clicks: [
          { key: "post", n: 4 },
          { key: null, n: 1 },
        ],
        entries: [
          { source: "linkedin", medium: "post", n: 2 },
          { source: "google", medium: "organic", n: 5 },
        ],
        newLeads: 1,
      }),
    ).toEqual({
      issued: 8,
      madePublic: 6,
      shareRate: 75,
      shared: { post: 3, profile: 2, other: 0, total: 5 },
      views: { post: 30, profile: 8, other: 2, total: 40 },
      clicks: { post: 4, profile: 0, other: 1, total: 5 },
      clickRate: 13,
      newLearners: 2,
      newLeads: 1,
    });
  });
});
