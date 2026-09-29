import { describe, expect, it } from "vitest";

import { DEFAULT_LANDING_BLOCKS, DEFAULT_REGISTRATION_FORM } from "@/core/webinars/landing";
import {
  blocksPublishing,
  validateSetup,
  webinarPublishIssues,
  type WebinarSetupInput,
} from "@/core/webinars/setup";
import {
  formatWebinarTime,
  isTimeZone,
  timeZoneOptions,
  utcToZonedInput,
  zonedTimeToUtc,
} from "@/core/webinars/time";

describe("time zones", () => {
  it("turns a local time in the webinar's zone into UTC and back", () => {
    expect(zonedTimeToUtc("2026-10-06", "18:00", "Europe/Berlin")).toEqual(
      new Date("2026-10-06T16:00:00Z"),
    );
    expect(zonedTimeToUtc("2026-12-01", "18:00", "Europe/Berlin")).toEqual(
      new Date("2026-12-01T17:00:00Z"),
    );
    expect(zonedTimeToUtc("2026-10-06", "09:30", "America/New_York")).toEqual(
      new Date("2026-10-06T13:30:00Z"),
    );
    expect(utcToZonedInput(new Date("2026-10-06T16:00:00Z"), "Europe/Berlin")).toEqual({
      date: "2026-10-06",
      time: "18:00",
    });
  });

  it("handles the hours the clocks skip and repeat", () => {
    // 02:30 does not exist on 29 March 2026 in Berlin: it moves on with the clocks.
    expect(zonedTimeToUtc("2026-03-29", "02:30", "Europe/Berlin")).toEqual(
      new Date("2026-03-29T01:30:00Z"),
    );
    // 02:30 happens twice on 25 October 2026: the first one.
    expect(zonedTimeToUtc("2026-10-25", "02:30", "Europe/Berlin")).toEqual(
      new Date("2026-10-25T00:30:00Z"),
    );
  });

  it("refuses what is not a date, a time or a zone", () => {
    expect(zonedTimeToUtc("2026-02-30", "10:00", "Europe/Berlin")).toBeNull();
    expect(zonedTimeToUtc("2026-10-06", "25:00", "Europe/Berlin")).toBeNull();
    expect(zonedTimeToUtc("06.10.2026", "10:00", "Europe/Berlin")).toBeNull();
    expect(zonedTimeToUtc("2026-10-06", "10:00", "Mars/Olympus")).toBeNull();
    expect(isTimeZone("Europe/Berlin")).toBe(true);
    expect(isTimeZone("")).toBe(false);
    expect(timeZoneOptions()[0]).toBe("UTC");
    expect(timeZoneOptions()).toContain("Europe/Berlin");
  });

  it("writes the date and time in the reader's language, with the zone", () => {
    const start = new Date("2026-10-06T16:00:00Z");
    expect(formatWebinarTime(start, 60, "Europe/Berlin", "en")).toBe(
      "Tue, 6 Oct 2026, 18:00–19:00 CEST",
    );
    expect(formatWebinarTime(start, 90, "Europe/Berlin", "de")).toBe(
      "Di., 6. Okt. 2026, 18:00–19:30 MESZ",
    );
    expect(formatWebinarTime(start, 60, "America/New_York", "en")).toMatch(/12:00–13:00 GMT-4$/);
  });
});

const input: WebinarSetupInput = {
  slug: "pricing-live",
  locale: "de",
  title: "Pricing live",
  description: "Wir bauen gemeinsam eine Preisseite.",
  date: "2026-10-06",
  time: "18:00",
  timeZone: "Europe/Berlin",
  durationMinutes: "60",
  capacity: "",
  joinUrl: "https://meet.example.com/abc",
  courseId: "",
  recorded: false,
  recordingNotice: "",
};

describe("webinar setup", () => {
  it("validates what the Studio enters", () => {
    const result = validateSetup(input, { locales: ["de", "en"] });
    expect(result).toEqual({
      ok: true,
      setup: {
        slug: "pricing-live",
        locale: "de",
        title: "Pricing live",
        description: "Wir bauen gemeinsam eine Preisseite.",
        startsAt: new Date("2026-10-06T16:00:00Z"),
        timeZone: "Europe/Berlin",
        durationMinutes: 60,
        capacity: null,
        joinUrl: "https://meet.example.com/abc",
        courseId: null,
        recorded: false,
        recordingNotice: null,
      },
    });
  });

  it("reports every problem by code", () => {
    const result = validateSetup(
      {
        ...input,
        slug: "Pricing Live",
        locale: "fr",
        title: "P",
        date: "2026-13-01",
        durationMinutes: "5",
        capacity: "0",
        joinUrl: "http://meet.example.com",
        courseId: "nope",
      },
      { locales: ["de", "en"] },
    );
    expect(result).toEqual({
      ok: false,
      issues: [
        "slug",
        "locale",
        "title",
        "date",
        "duration",
        "capacity",
        "join_url_https",
        "course",
      ],
    });
    expect(validateSetup(input, { locales: ["en"] })).toMatchObject({ issues: ["locale"] });
  });

  it("keeps the recording notice only for recorded webinars", () => {
    const recorded = validateSetup(
      { ...input, recorded: true, recordingNotice: "Wir zeichnen auf." },
      { locales: ["de"] },
    );
    expect(recorded.ok && recorded.setup.recordingNotice).toBe("Wir zeichnen auf.");
    const notRecorded = validateSetup(
      { ...input, recordingNotice: "Wir zeichnen auf." },
      { locales: ["de"] },
    );
    expect(notRecorded.ok && notRecorded.setup.recordingNotice).toBeNull();
  });
});

describe("publishing a webinar", () => {
  const base = {
    content: {
      title: "Pricing live",
      description: "We build a pricing page.",
      blocks: DEFAULT_LANDING_BLOCKS,
      form: DEFAULT_REGISTRATION_FORM,
      presenters: [],
      recordingNotice: null,
    },
    startsAt: new Date("2026-10-06T16:00:00Z"),
    durationMinutes: 60,
    joinUrl: "https://meet.example.com/abc",
    legal: { imprint: "https://example.com/imprint", privacy: "https://example.com/privacy" },
    course: null,
    now: new Date("2026-10-01T09:00:00Z"),
  };

  it("goes live with a description, legal pages and a date to come", () => {
    expect(webinarPublishIssues(base)).toEqual([]);
  });

  it("blocks what cannot go out, warns about what can wait", () => {
    const issues = webinarPublishIssues({
      ...base,
      content: { ...base.content, title: "Get certified live", description: "" },
      joinUrl: null,
      legal: { imprint: "https://example.com/imprint" },
      course: { status: "draft" },
      now: new Date("2026-10-07T09:00:00Z"),
    });
    expect(issues.map((issue) => [issue.code, issue.severity])).toEqual([
      ["description_missing", "error"],
      ["ended", "error"],
      ["legal_pages_missing", "error"],
      ["wording", "error"],
      ["join_url_missing", "warning"],
      ["course_not_published", "warning"],
    ]);
    expect(blocksPublishing(issues)).toBe(true);
    expect(blocksPublishing(issues.filter((issue) => issue.severity === "warning"))).toBe(false);
  });
});
