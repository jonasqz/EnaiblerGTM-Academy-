/**
 * Calendar files (RFC 5545, with the iTIP methods of RFC 5546) for webinar
 * invitations. One UID per webinar keeps every update and cancellation on
 * the same calendar entry; SEQUENCE grows with each change, so calendars
 * take the newest. Times are UTC. Several events fit in one file, for a
 * series later on.
 */

export type IcsMethod = "PUBLISH" | "REQUEST" | "CANCEL";

export interface IcsEvent {
  /** Stable per webinar, e.g. "webinar-<id>@academy.example.com". */
  uid: string;
  sequence: number;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  /** The webinar's page on the academy. */
  url?: string;
  location?: string;
}

export interface IcsCalendar {
  method: IcsMethod;
  /** The academy, as the one who invites (REQUEST and CANCEL need it). */
  organizer?: { name: string; email: string };
  /** The registrant's address, for REQUEST and CANCEL. */
  attendee?: string;
  events: readonly IcsEvent[];
  /** DTSTAMP: when this version of the file was made. */
  now: Date;
}

const PRODID = "-//enaibler//Webinars//EN";

/** 20261006T160000Z */
export function icsDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** TEXT values: backslash, semicolon, comma and line breaks escaped (RFC 5545 §3.3.11). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** A parameter value (e.g. CN) in quotes; quotes and control characters cannot appear in one. */
function paramValue(value: string): string {
  return `"${value.replace(/["\p{Cc}]/gu, "").slice(0, 200)}"`;
}

/**
 * Lines longer than 75 octets continue on the next line after a space
 * (RFC 5545 §3.1), never inside a multi-byte character.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // The first line holds 75 octets, continuations 74 after their leading space.
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(calendar: IcsCalendar): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    `METHOD:${calendar.method}`,
  ];
  const invitation = calendar.method !== "PUBLISH";
  for (const event of calendar.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `SEQUENCE:${event.sequence}`,
      `DTSTAMP:${icsDate(calendar.now)}`,
      `DTSTART:${icsDate(event.start)}`,
      `DTEND:${icsDate(event.end)}`,
      `SUMMARY:${escapeIcsText(event.summary)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    if (event.url) lines.push(`URL:${event.url}`);
    if (invitation && calendar.organizer) {
      lines.push(
        `ORGANIZER;CN=${paramValue(calendar.organizer.name)}:mailto:${calendar.organizer.email}`,
      );
    }
    if (invitation && calendar.attendee) {
      // No RSVP: the registration is the answer, and replies would reach a no-reply sender.
      lines.push(
        `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${calendar.attendee}`,
      );
    }
    lines.push(
      `STATUS:${calendar.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

/** The UID of a webinar's calendar entry: the same in every file about it. */
export function webinarUid(webinarId: string, domain: string): string {
  return `webinar-${webinarId}@${domain}`;
}
