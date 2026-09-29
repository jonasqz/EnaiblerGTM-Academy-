import { describe, expect, it } from "vitest";

import {
  buildIcs,
  escapeIcsText,
  foldIcsLine,
  icsDate,
  webinarUid,
  type IcsEvent,
} from "@/core/webinars/ics";

const event: IcsEvent = {
  uid: webinarUid("7b1c", "academy.example.com"),
  sequence: 0,
  start: new Date("2026-10-06T16:00:00Z"),
  end: new Date("2026-10-06T17:00:00Z"),
  summary: "Pricing live; with Q&A, in German",
  description: "Line one\nLine two",
  url: "https://academy.example.com/webinars/pricing-live",
};
const now = new Date("2026-10-01T09:30:00Z");

const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe(".ics files", () => {
  it("write a calendar with one event, UTC times and CRLF lines", () => {
    const ics = buildIcs({ method: "PUBLISH", events: [event], now });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    const lines = unfold(ics).split("\r\n");
    expect(lines).toContain("METHOD:PUBLISH");
    expect(lines).toContain("UID:webinar-7b1c@academy.example.com");
    expect(lines).toContain("DTSTART:20261006T160000Z");
    expect(lines).toContain("DTEND:20261006T170000Z");
    expect(lines).toContain("DTSTAMP:20261001T093000Z");
    expect(lines).toContain("SEQUENCE:0");
    expect(lines).toContain("SUMMARY:Pricing live\\; with Q&A\\, in German");
    expect(lines).toContain("DESCRIPTION:Line one\\nLine two");
    expect(lines).toContain("STATUS:CONFIRMED");
    // A published file invites nobody.
    expect(ics).not.toContain("ORGANIZER");
    expect(ics).not.toContain("ATTENDEE");
  });

  it("invite with organizer and attendee, and cancel the same entry with a higher sequence", () => {
    const organizer = { name: 'Acme "Academy"', email: "academy@mail.example.com" };
    const request = unfold(
      buildIcs({
        method: "REQUEST",
        organizer,
        attendee: "ada@example.com",
        events: [event],
        now,
      }),
    );
    expect(request).toContain('ORGANIZER;CN="Acme Academy":mailto:academy@mail.example.com');
    expect(request).toContain(
      "ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:ada@example.com",
    );
    const cancel = unfold(
      buildIcs({
        method: "CANCEL",
        organizer,
        attendee: "ada@example.com",
        events: [{ ...event, sequence: 2 }],
        now,
      }),
    );
    expect(cancel).toContain("METHOD:CANCEL");
    expect(cancel).toContain("STATUS:CANCELLED");
    expect(cancel).toContain("SEQUENCE:2");
    expect(cancel).toContain("UID:webinar-7b1c@academy.example.com");
  });

  it("holds several events, for a series", () => {
    const ics = buildIcs({
      method: "PUBLISH",
      events: [event, { ...event, uid: "webinar-2@academy.example.com" }],
      now,
    });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it("escapes text and folds long lines at 75 octets, never inside a character", () => {
    expect(escapeIcsText("a\\b;c,d\r\ne")).toBe("a\\\\b\\;c\\,d\\ne");
    const long = `SUMMARY:${"Ü".repeat(60)}`;
    const folded = foldIcsLine(long);
    const encoder = new TextEncoder();
    for (const line of folded.split("\r\n"))
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    expect(
      folded
        .split("\r\n")
        .slice(1)
        .every((line) => line.startsWith(" ")),
    ).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(long);
    expect(foldIcsLine("SHORT:line")).toBe("SHORT:line");
    expect(icsDate(new Date("2026-01-02T03:04:05.678Z"))).toBe("20260102T030405Z");
  });
});
