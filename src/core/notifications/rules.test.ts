import { describe, expect, it } from "vitest";

import {
  REVIEW_ALERT_DELAY_SECONDS,
  retryDelaySeconds,
  reviewAlertScope,
  reviewAlertSendAfter,
  reviewAlertWaitsUntil,
  reviewMailDecision,
} from "@/core/notifications/rules";

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

describe("review alerts", () => {
  const now = new Date("2026-10-01T10:00:00Z");
  const minutesLater = (from: Date, minutes: number) => new Date(from.getTime() + minutes * 60_000);

  it("wait a few minutes, so hand-ins arriving together share a mail", () => {
    expect(reviewAlertSendAfter(now, null)).toEqual(
      new Date(now.getTime() + REVIEW_ALERT_DELAY_SECONDS * 1000),
    );
  });

  it("go out at most once an hour per person", () => {
    const lastSent = minutesLater(now, -20);
    expect(reviewAlertSendAfter(now, lastSent)).toEqual(minutesLater(lastSent, 60));
    expect(reviewAlertSendAfter(now, minutesLater(now, -120))).toEqual(
      minutesLater(now, REVIEW_ALERT_DELAY_SECONDS / 60),
    );
    expect(reviewAlertWaitsUntil(now, lastSent)).toEqual(minutesLater(lastSent, 60));
    expect(reviewAlertWaitsUntil(now, minutesLater(now, -60))).toBeNull();
    expect(reviewAlertWaitsUntil(now, null)).toBeNull();
  });

  it("reach whoever decides reviews, mentors for their cohorts only", () => {
    expect(reviewAlertScope(["reviewer"])).toBe("all");
    expect(reviewAlertScope(["author", "learner"])).toBe("all");
    expect(reviewAlertScope(["tenant_admin"])).toBe("all");
    expect(reviewAlertScope(["mentor"])).toBe("cohorts");
    expect(reviewAlertScope(["mentor", "reviewer"])).toBe("all");
    expect(reviewAlertScope(["learner"])).toBeNull();
    expect(reviewAlertScope([])).toBeNull();
  });
});
