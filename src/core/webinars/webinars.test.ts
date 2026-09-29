import { describe, expect, it } from "vitest";

import {
  capacityState,
  seatFor,
  seatsLeft,
  toPromote,
  waitlistOrder,
} from "@/core/webinars/capacity";
import {
  checkinCodeMatches,
  CHECKIN_ALPHABET,
  CHECKIN_CODE_LENGTH,
  formatCheckinCode,
  generateCheckinCode,
  isCheckinCode,
  normalizeCheckinCode,
} from "@/core/webinars/checkin";
import {
  checkinOpen,
  joinLinkVisible,
  pendingExpiresAt,
  registrationOpen,
  webinarEnd,
  webinarPhase,
} from "@/core/webinars/phase";
import { givenConsents, isConfirmed } from "@/core/webinars/registration";
import { isReminderStep, reminderSchedule, reminderTime } from "@/core/webinars/reminders";
import { joinUrlIssue, linkAdapter, OFFERED_TOOLS, toolAdapter } from "@/core/webinars/tools";

const start = new Date("2026-10-06T16:00:00Z");
const webinar = { startsAt: start, durationMinutes: 60 };
const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);

describe("webinar phase", () => {
  it("is upcoming, live and ended by the clock", () => {
    expect(webinarPhase(webinar, at(-1))).toBe("upcoming");
    expect(webinarPhase(webinar, at(0))).toBe("live");
    expect(webinarPhase(webinar, at(59))).toBe("live");
    expect(webinarPhase(webinar, at(60))).toBe("ended");
    expect(webinarEnd(webinar)).toEqual(at(60));
  });

  it("shows the join link from 15 minutes before the start until the end", () => {
    expect(joinLinkVisible(webinar, at(-16))).toBe(false);
    expect(joinLinkVisible(webinar, at(-15))).toBe(true);
    expect(joinLinkVisible(webinar, at(30))).toBe(true);
    expect(joinLinkVisible(webinar, at(60))).toBe(false);
  });

  it("takes check-in codes from shortly before the start until half an hour after the end", () => {
    expect(checkinOpen(webinar, at(-16))).toBe(false);
    expect(checkinOpen(webinar, at(-15))).toBe(true);
    expect(checkinOpen(webinar, at(89))).toBe(true);
    expect(checkinOpen(webinar, at(90))).toBe(false);
  });

  it("takes registrations for published webinars until they end", () => {
    const published = { ...webinar, status: "published" as const };
    expect(registrationOpen(published, at(-600))).toBe(true);
    expect(registrationOpen(published, at(30))).toBe(true);
    expect(registrationOpen(published, at(60))).toBe(false);
    expect(registrationOpen({ ...published, status: "draft" }, at(-600))).toBe(false);
    expect(registrationOpen({ ...published, status: "cancelled" }, at(-600))).toBe(false);
  });

  it("lets a pending registration expire after a day", () => {
    expect(pendingExpiresAt(start)).toEqual(at(24 * 60));
  });
});

describe("capacity and waitlist", () => {
  it("gives seats until the room is full, then the waitlist", () => {
    expect(seatFor(2, 0)).toBe("registered");
    expect(seatFor(2, 1)).toBe("registered");
    expect(seatFor(2, 2)).toBe("waitlist");
    expect(seatFor(2, 5)).toBe("waitlist");
    expect(seatFor(null, 10_000)).toBe("registered");
    expect(seatsLeft(10, 7)).toBe(3);
    expect(seatsLeft(10, 12)).toBe(0);
    expect(seatsLeft(null, 3)).toBeNull();
  });

  it("says when few seats are left", () => {
    expect(capacityState(null, 500)).toBe("open");
    expect(capacityState(100, 50)).toBe("open");
    expect(capacityState(100, 90)).toBe("few_left");
    expect(capacityState(10, 7)).toBe("few_left");
    expect(capacityState(10, 10)).toBe("full");
  });

  it("promotes whoever waited longest, as many as seats are free", () => {
    const waitlist = [
      { id: "c", queuedAt: at(3) },
      { id: "a", queuedAt: at(1) },
      { id: "b2", queuedAt: at(2) },
      { id: "b1", queuedAt: at(2) },
    ];
    expect(waitlistOrder(waitlist).map((entry) => entry.id)).toEqual(["a", "b1", "b2", "c"]);
    expect(toPromote(5, 4, waitlist).map((entry) => entry.id)).toEqual(["a"]);
    expect(toPromote(5, 2, waitlist).map((entry) => entry.id)).toEqual(["a", "b1", "b2"]);
    // A smaller room takes nobody's seat, and moves nobody up.
    expect(toPromote(3, 5, waitlist)).toEqual([]);
    expect(toPromote(null, 5, waitlist)).toHaveLength(4);
  });
});

describe("check-in codes", () => {
  it("are six characters without look-alikes", () => {
    let seed = 0;
    const random = (size: number) => Uint8Array.from({ length: size }, () => (seed += 37) % 256);
    const code = generateCheckinCode(random);
    expect(code).toHaveLength(CHECKIN_CODE_LENGTH);
    expect(isCheckinCode(code)).toBe(true);
    expect(CHECKIN_ALPHABET).not.toMatch(/[01ILOU]/);
  });

  it("never uses the bytes that would favour some letters", () => {
    // 240..255 lie above the last full multiple of the alphabet and are skipped.
    const bytes = [250, 251, 0, 29, 240, 1, 2, 3, 4];
    let index = 0;
    const code = generateCheckinCode((size) =>
      Uint8Array.from({ length: size }, () => bytes[index++ % bytes.length]!),
    );
    expect(code.startsWith(`${CHECKIN_ALPHABET[0]}${CHECKIN_ALPHABET[29]}`)).toBe(true);
  });

  it("match what people type, whatever the case and spacing", () => {
    expect(normalizeCheckinCode(" k7m-4qx ")).toBe("K7M4QX");
    expect(checkinCodeMatches("K7M4QX", "k7m 4qx")).toBe(true);
    expect(checkinCodeMatches("K7M4QX", "K7M4QY")).toBe(false);
    expect(checkinCodeMatches("K7M4QX", "K7M4Q")).toBe(false);
    expect(formatCheckinCode("K7M4QX")).toBe("K7M 4QX");
  });
});

describe("reminder schedule", () => {
  it("plans 24 hours and one hour before, at the start and an hour after the end", () => {
    const plan = reminderSchedule(webinar, at(-3 * 24 * 60));
    expect(plan.map((entry) => entry.step)).toEqual([
      "reminder_24h",
      "reminder_1h",
      "starting",
      "followup",
    ]);
    expect(plan.map((entry) => entry.sendAt)).toEqual([at(-24 * 60), at(-60), at(0), at(120)]);
  });

  it("skips reminders whose time has passed", () => {
    expect(reminderSchedule(webinar, at(-90)).map((entry) => entry.step)).toEqual([
      "reminder_1h",
      "starting",
      "followup",
    ]);
    expect(reminderSchedule(webinar, at(-30)).map((entry) => entry.step)).toEqual([
      "starting",
      "followup",
    ]);
    // Registering while it runs: only the follow-up is left.
    expect(reminderSchedule(webinar, at(10)).map((entry) => entry.step)).toEqual(["followup"]);
    expect(reminderSchedule(webinar, at(121))).toEqual([]);
  });

  it("keeps a step that is due this very minute", () => {
    expect(reminderSchedule(webinar, new Date(at(-60).getTime() + 20_000))[0]?.step).toBe(
      "reminder_1h",
    );
    expect(reminderTime("starting", webinar)).toEqual(start);
    expect(isReminderStep("starting")).toBe(true);
    expect(isReminderStep("confirmation")).toBe(false);
  });
});

describe("registration consents", () => {
  it("records participation with the recording notice, and the optional ones only when given", () => {
    const now = new Date("2026-10-01T09:00:00Z");
    expect(
      givenConsents({ participation: "I register.", recording: "It is recorded." }, now),
    ).toEqual([
      { purpose: "participation", wording: "I register. It is recorded.", at: now.toISOString() },
    ]);
    const all = givenConsents(
      { participation: "I register.", marketing: "News, please.", leadHandoff: "Contact me." },
      now,
    );
    expect(all.map((consent) => consent.purpose)).toEqual([
      "participation",
      "marketing",
      "lead_handoff",
    ]);
    expect(isConfirmed("waitlist")).toBe(true);
    expect(isConfirmed("pending")).toBe(false);
  });
});

describe("tool adapters", () => {
  it("offers link only for now, and falls back to it", async () => {
    expect(OFFERED_TOOLS).toEqual(["link"]);
    expect(toolAdapter("zoom")).toBe(linkAdapter);
    const session = {
      webinarId: "w",
      title: "T",
      startsAt: start,
      durationMinutes: 60,
      timeZone: "Europe/Berlin",
      joinUrl: "https://meet.example.com/abc",
      externalId: null,
    };
    await expect(linkAdapter.createSession(session)).resolves.toEqual({
      joinUrl: "https://meet.example.com/abc",
      externalId: null,
    });
    await expect(linkAdapter.fetchAttendance(session)).resolves.toBeNull();
    await expect(linkAdapter.fetchRecording(session)).resolves.toBeNull();
    await expect(
      linkAdapter.registerAttendee(session, { email: "a@b.de", name: null }),
    ).resolves.toEqual({ joinUrl: null });
    expect(linkAdapter.attendance).toBe("checkin_or_file");
  });

  it("takes https join links without credentials", () => {
    expect(joinUrlIssue("https://us02web.zoom.us/j/123?pwd=abc")).toBeNull();
    expect(joinUrlIssue("https://teams.microsoft.com/l/meetup-join/19%3a")).toBeNull();
    expect(joinUrlIssue("http://meet.google.com/abc-defg-hij")).toBe("https");
    expect(joinUrlIssue("https://user:pw@example.com")).toBe("invalid");
    expect(joinUrlIssue("not a link")).toBe("invalid");
  });
});
