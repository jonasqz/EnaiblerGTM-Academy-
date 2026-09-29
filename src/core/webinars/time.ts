import { z } from "zod";

/*
 * Webinars are stored in UTC with the IANA time zone they are held in
 * (webinar brief §3: stored in UTC, shown in the viewer's zone, landing
 * page shows both). The Studio enters a local date and time in that zone.
 */

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z.string().trim().refine(isTimeZone, "Use an IANA time zone");

/** Zones the Studio offers; the runtime's list, with UTC first. */
export function timeZoneOptions(): string[] {
  const zones =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return ["UTC", ...zones.filter((zone) => zone !== "UTC")];
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Milliseconds the zone is ahead of UTC at that instant. */
function offsetAt(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * The instant a wall-clock time in a zone stands for ("2026-10-06", "18:00",
 * "Europe/Berlin" → 16:00 UTC). A time that does not exist (the hour the
 * clocks skip) moves forward with the clocks; an ambiguous one takes the
 * earlier instant. Null for malformed input.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date | null {
  const d = DATE.exec(date);
  const t = TIME.exec(time);
  if (!d || !t || !isTimeZone(timeZone)) return null;
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hour, minute, second] = [Number(t[1]), Number(t[2]), Number(t[3] ?? 0)];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59)
    return null;
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(wall);
  if (check.getUTCDate() !== day || check.getUTCMonth() !== month - 1) return null;
  const DAY = 24 * 60 * 60_000;
  // The zone's offsets around that day; a candidate counts if it reads back as the same wall time.
  const candidates = [wall - DAY, wall, wall + DAY].map(
    (probe) => wall - offsetAt(new Date(probe), timeZone),
  );
  const valid = candidates
    .filter((candidate) => {
      const p = zonedParts(new Date(candidate), timeZone);
      return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) === wall;
    })
    .sort((a, b) => a - b);
  if (valid.length > 0) return new Date(valid[0]!);
  // In the gap: the offset from before it, which lands as far past the gap as the time was in it.
  return new Date(candidates[0]!);
}

/** The wall-clock date and time of an instant in a zone, as the Studio's inputs take them. */
export function utcToZonedInput(instant: Date, timeZone: string): { date: string; time: string } {
  const p = zonedParts(instant, timeZone);
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  return {
    date: `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

const INTL_LOCALE: Record<string, string> = { en: "en-GB", de: "de-DE" };

/**
 * "6 October 2026": the day a webinar was held, in its own zone. A
 * recording says when it was made, never a time to be there.
 */
export function formatWebinarDate(startsAt: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale] ?? locale, {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(startsAt);
}

/** "18:15": a time of day in a zone (the agenda's items). */
export function formatClock(instant: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale] ?? locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}

/**
 * "Tue, 6 Oct 2026, 18:00–19:00 CEST": the date and time of a webinar in one
 * zone, in the reader's language. Used on the landing page (the webinar's
 * zone), in mails and in the browser (the viewer's own zone).
 */
export function formatWebinarTime(
  startsAt: Date,
  durationMinutes: number,
  timeZone: string,
  locale: string,
): string {
  const intl = INTL_LOCALE[locale] ?? locale;
  const end = new Date(startsAt.getTime() + durationMinutes * 60_000);
  const date = new Intl.DateTimeFormat(intl, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(startsAt);
  const time = new Intl.DateTimeFormat(intl, { timeZone, hour: "2-digit", minute: "2-digit" });
  const zone =
    new Intl.DateTimeFormat(intl, { timeZone, timeZoneName: "short" })
      .formatToParts(startsAt)
      .find((part) => part.type === "timeZoneName")?.value ?? timeZone;
  return `${date}, ${time.format(startsAt)}–${time.format(end)} ${zone}`;
}
