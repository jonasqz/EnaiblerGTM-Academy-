import { describe, expect, it } from "vitest";

import { buildIcs } from "@/core/webinars/ics";
import { seriesEvents, sessionsToRegister, type SeriesSession } from "@/core/webinars/series";

const HOUR = 60 * 60_000;
const now = new Date("2026-10-01T10:00:00Z");

function session(id: string, overrides: Partial<SeriesSession> = {}): SeriesSession {
  return {
    webinarId: id,
    status: "published",
    startsAt: new Date(now.getTime() + 48 * HOUR),
    durationMinutes: 60,
    registration: null,
    ...overrides,
  };
}

describe("one registration for the whole series", () => {
  const sessions = [
    session("open"),
    session("running", { startsAt: new Date(now.getTime() - 30 * 60_000) }),
    session("over", { startsAt: new Date(now.getTime() - 3 * HOUR) }),
    session("draft", { status: "draft" }),
    session("called-off", { status: "cancelled" }),
    session("seated", { registration: "registered" }),
    session("waiting", { registration: "waitlist" }),
    session("dropped", { registration: "cancelled" }),
  ];

  it("registers an enrolling learner for every session still open", () => {
    expect(sessionsToRegister(sessions, "enrolled", now)).toEqual(["open", "running", "dropped"]);
  });

  it("offers a session added later only to those who never cancelled it", () => {
    expect(sessionsToRegister(sessions, "added", now)).toEqual(["open", "running"]);
  });
});

describe("the series' calendar file", () => {
  it("holds every session in order, each on the entry its own invitations use", () => {
    const events = seriesEvents(
      [
        {
          id: "b",
          title: "Session 2",
          startsAt: new Date("2026-10-13T16:00:00Z"),
          durationMinutes: 90,
          sequence: 2,
          url: "https://academy.example.com/webinars/two",
        },
        {
          id: "a",
          title: "Session 1",
          startsAt: new Date("2026-10-06T16:00:00Z"),
          durationMinutes: 60,
          sequence: 0,
          url: "https://academy.example.com/webinars/one",
        },
      ],
      { domain: "academy.example.com", note: "Join from the webinar page." },
    );
    expect(events.map((event) => [event.uid, event.sequence])).toEqual([
      ["webinar-a@academy.example.com", 0],
      ["webinar-b@academy.example.com", 2],
    ]);
    expect(events[1]!.end).toEqual(new Date("2026-10-13T17:30:00Z"));
    const ics = buildIcs({
      method: "REQUEST",
      organizer: { name: "Academy", email: "academy@mail.example.com" },
      attendee: "ada@example.com",
      events,
      now,
    });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART:20261006T160000Z");
    expect(ics).toContain("DTSTART:20261013T160000Z");
    expect(ics.match(/ATTENDEE;/g)).toHaveLength(2);
    // Long lines are folded (RFC 5545 §3.1); unfolded, each entry leads to its own page.
    expect(ics.replace(/\r\n /g, "")).toContain(
      "DESCRIPTION:Join from the webinar page.\\nhttps://academy.example.com/webinars/one",
    );
  });
});
