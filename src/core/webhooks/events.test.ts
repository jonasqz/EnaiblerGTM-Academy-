import { describe, expect, it } from "vitest";

import {
  carriesEmail,
  isWebhookEvent,
  nextAttemptDelayMinutes,
  webhookUrlIssue,
  WEBHOOK_EVENT_GROUPS,
  WEBHOOK_EVENTS,
} from "@/core/webhooks/events";

describe("webhook events", () => {
  it("offers product and consent events, not page views", () => {
    expect(WEBHOOK_EVENTS).toContain("course_completed");
    expect(WEBHOOK_EVENTS).toContain("marketing_consent_withdrawn");
    expect(isWebhookEvent("verification_page_viewed")).toBe(false);
    expect(isWebhookEvent("ping")).toBe(true);
  });

  it("lists every event in the Studio exactly once", () => {
    const listed = Object.values(WEBHOOK_EVENT_GROUPS).flat();
    expect([...listed].sort()).toEqual([...WEBHOOK_EVENTS].sort());
  });

  it("names learners only with their consent (brief §9, lead handoff)", () => {
    expect(carriesEmail("course_completed", false)).toBe(false);
    expect(carriesEmail("course_completed", true)).toBe(true);
    // A consent change is about that address: the receiving tool must act on it.
    expect(carriesEmail("marketing_consent_withdrawn", false)).toBe(true);
  });

  it("backs off over a day, then gives up", () => {
    expect([1, 2, 3, 7, 20].map(nextAttemptDelayMinutes)).toEqual([1, 5, 30, 1440, 1440]);
  });

  it("wants https endpoints", () => {
    expect(webhookUrlIssue("https://hooks.example.com/enaibler", { allowHttp: false })).toBeNull();
    expect(webhookUrlIssue("http://hooks.example.com/x", { allowHttp: false })).toBe("https");
    expect(webhookUrlIssue("http://hooks.example.com/x", { allowHttp: true })).toBeNull();
    expect(webhookUrlIssue("not a url", { allowHttp: true })).toBe("invalid");
    expect(webhookUrlIssue("https://user:pw@example.com", { allowHttp: false })).toBe("invalid");
  });
});
