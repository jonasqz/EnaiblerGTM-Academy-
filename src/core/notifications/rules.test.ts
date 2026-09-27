import { describe, expect, it } from "vitest";

import { retryDelaySeconds, reviewMailDecision } from "@/core/notifications/rules";

const decidedAt = new Date("2026-10-01T10:00:00Z");

describe("review mail", () => {
  it("goes out for a decided result the learner has not seen", () => {
    expect(reviewMailDecision({ status: "passed", decidedAt, resultSeenAt: null })).toBe("send");
    expect(reviewMailDecision({ status: "needs_revision", decidedAt, resultSeenAt: null })).toBe(
      "send",
    );
  });

  it("stays home when the learner watched the result arrive", () => {
    const seen = new Date(decidedAt.getTime() + 5_000);
    expect(reviewMailDecision({ status: "passed", decidedAt, resultSeenAt: seen })).toBe("seen");
  });

  it("goes out again when a reviewer changes a result the learner saw earlier", () => {
    const seenBefore = new Date(decidedAt.getTime() - 60_000);
    expect(reviewMailDecision({ status: "overridden", decidedAt, resultSeenAt: seenBefore })).toBe(
      "send",
    );
  });

  it("waits while the work is still in review", () => {
    expect(reviewMailDecision({ status: "in_review", decidedAt: null, resultSeenAt: null })).toBe(
      "undecided",
    );
    expect(reviewMailDecision({ status: "submitted", decidedAt: null, resultSeenAt: null })).toBe(
      "undecided",
    );
  });

  it("backs off between failed sends", () => {
    expect([1, 2, 3, 4, 9].map(retryDelaySeconds)).toEqual([60, 300, 900, 3600, 3600]);
  });
});
