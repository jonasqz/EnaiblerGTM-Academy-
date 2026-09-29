import { zonedTimeToUtc } from "@/core/webinars/time";

/**
 * Attendance from a file (webinar brief §2.3, "link only": manual upload).
 * Hosts export what their tool gives them: Zoom's participant or attendee
 * report, the attendance list from Teams, a Meet attendance sheet, or just a
 * list of addresses. Rows are matched to registrants by e-mail address; the
 * parser reads what it can and says which lines it could not use.
 */

export type AttendanceFormat = "zoom" | "teams" | "meet" | "table" | "emails";

export interface AttendanceRow {
  /** First line (1-based) the address appeared on. */
  line: number;
  email: string;
  joinedAt: Date | null;
  leftAt: Date | null;
  /** Summed over every join of the same address; null when the file has no durations. */
  durationMinutes: number | null;
}

export interface SkippedLine {
  line: number;
  reason: "no_email";
  /** The line as in the file, shortened: the host sees what was left out. */
  text: string;
}

export interface AttendanceParse {
  format: AttendanceFormat;
  rows: AttendanceRow[];
  skipped: SkippedLine[];
}

/** Most rows one file may have: far more than any webinar, few enough to preview. */
export const MAX_ATTENDANCE_ROWS = 5000;

/**
 * Bytes as text: Teams writes UTF-16 with a byte order mark, spreadsheets
 * write UTF-8 with or without one.
 */
export function decodeAttendanceFile(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  // UTF-16 without a mark still shows its zero bytes.
  if (bytes.length > 3 && bytes[1] === 0 && bytes[3] === 0) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  return new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
}

const EMAIL = /^[^\s@<>(),;:"'[\]]+@[^\s@<>(),;:"'[\]]+\.[^\s@<>(),;:"'[\]]{2,}$/;
const EMAIL_IN_TEXT = /[^\s@<>(),;:"'[\]]+@[^\s@<>(),;:"'[\]]+\.[^\s@<>(),;:"'[\]]{2,}/;

export function asEmail(value: string): string | null {
  const email = value
    .trim()
    .replace(/^mailto:/i, "")
    .toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

interface Record_ {
  line: number;
  cells: string[];
}

function delimiterOf(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 40).join("\n");
  if (sample.includes("\t")) return "\t";
  const count = (char: string) => sample.split(char).length - 1;
  return count(";") > count(",") ? ";" : ",";
}

/** RFC 4180 records with quoted fields (which may hold the delimiter and line breaks). */
function records(text: string, delimiter: string): Record_[] {
  const out: Record_[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let startLine = 1;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (char === "\n") line++;
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (char === delimiter) {
      cells.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      cells.push(cell);
      out.push({ line: startLine, cells });
      cells = [];
      cell = "";
      line++;
      startLine = line;
    } else cell += char;
  }
  if (cell !== "" || cells.length > 0) {
    cells.push(cell);
    out.push({ line: startLine, cells });
  }
  return out.map((record) => ({ ...record, cells: record.cells.map((value) => value.trim()) }));
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[ \s]+/g, " ")
    .trim();
}

type Column = "email" | "upn" | "joined" | "left" | "duration" | "attended";

/** Column names in English and German, as the tools write them. */
function columnOf(header: string): Column | null {
  // Zoom's webinar report lists registrants who never came, with "Attended: No".
  if (/^(attended|teilgenommen)$/.test(header)) return "attended";
  if (/\bupn\b/.test(header)) return "upn";
  if (/(^|[\s(])e-?mail\b|^mail$|e-mail-adresse|email address/.test(header)) return "email";
  if (
    /duration|time in session|dauer|anwesenheitsdauer|minutes attended|attended \(min/.test(header)
  )
    return "duration";
  if (
    /first join|join time|time joined|^joined|erster beitritt|beitrittszeit|beigetreten/.test(
      header,
    )
  )
    return "joined";
  if (
    /last leave|leave time|time exited|time left|^left|letztes verlassen|verlassenszeit|verlassen/.test(
      header,
    )
  )
    return "left";
  return null;
}

function formatOf(headers: string[]): AttendanceFormat {
  const all = headers.join("|");
  if (/user email|time in session|original name|duration \(minutes\)/.test(all)) return "zoom";
  if (/in-meeting duration|first join|\bupn\b|erster beitritt|dauer der besprechung/.test(all))
    return "teams";
  if (/time joined|time exited|beitrittszeit|verlassenszeit/.test(all)) return "meet";
  return "table";
}

/** Minutes from "62", "1:02:03", "1h 2m 3s", "1 hr 5 min", "1 Std. 2 Min. 3 Sek.". */
export function parseDuration(
  value: string,
  unit: "minutes" | "seconds" = "minutes",
): number | null {
  const text = value.trim().toLowerCase();
  if (!text) return null;
  if (/^\d+([.,]\d+)?$/.test(text)) {
    const number = Number(text.replace(",", "."));
    return Math.round(unit === "seconds" ? number / 60 : number);
  }
  const clock = /^(\d{1,3}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (clock) {
    const [a, b, c] = [Number(clock[1]), Number(clock[2]), clock[3] ? Number(clock[3]) : null];
    // h:mm:ss, or mm:ss without hours.
    return c === null ? Math.round(a + b / 60) : Math.round(a * 60 + b + c / 60);
  }
  let seconds = 0;
  let found = false;
  for (const match of text.matchAll(
    /(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|hours?|std\.?|stunden?|m|min\.?|mins?|minutes?|minuten?|s|sec\.?|secs?|seconds?|sek\.?|sekunden?)\b\.?/g,
  )) {
    found = true;
    const amount = Number(match[1]!.replace(",", "."));
    const unitText = match[2]!;
    if (/^(h|hr|hrs|hour|hours|std|stunde|stunden)/.test(unitText)) seconds += amount * 3600;
    else if (/^(m|min|mins|minute|minutes|minuten)/.test(unitText)) seconds += amount * 60;
    else seconds += amount;
  }
  return found ? Math.round(seconds / 60) : null;
}

/**
 * A time from the file. With an offset or "Z" it is exact; without one it is
 * read as local time where the webinar is held, which is what the tools show.
 */
export function parseAttendanceTime(value: string, timeZone: string): Date | null {
  const text = value.trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const time = (hour: string, minute: string, second: string | undefined, ampm?: string) => {
    let h = Number(hour);
    const meridiem = ampm?.toLowerCase();
    if (meridiem === "pm" && h < 12) h += 12;
    if (meridiem === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${minute}:${second ?? "00"}`;
  };
  const year = (value: string) => (value.length === 2 ? `20${value}` : value);
  const pad = (value: string) => value.padStart(2, "0");
  const iso = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (iso) {
    return zonedTimeToUtc(
      `${iso[1]}-${iso[2]}-${iso[3]}`,
      time(iso[4]!, iso[5]!, iso[6]),
      timeZone,
    );
  }
  const us =
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?$/i.exec(text);
  if (us) {
    return zonedTimeToUtc(
      `${year(us[3]!)}-${pad(us[1]!)}-${pad(us[2]!)}`,
      time(us[4]!, us[5]!, us[6], us[7]),
      timeZone,
    );
  }
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (de) {
    return zonedTimeToUtc(
      `${year(de[3]!)}-${pad(de[2]!)}-${pad(de[1]!)}`,
      time(de[4]!, de[5]!, de[6]),
      timeZone,
    );
  }
  return null;
}

function shorten(cells: string[]): string {
  const text = cells.filter(Boolean).join(", ");
  return text.length > 120 ? `${text.slice(0, 119)}…` : text;
}

/**
 * One row per address. Within a table the joins add up (Zoom lists every
 * rejoin); across tables of one report the longest counts, since Teams lists
 * the same people as totals and again per join.
 */
function merge(rows: AttendanceRow[], durations: "sum" | "max" = "sum"): AttendanceRow[] {
  const byEmail = new Map<string, AttendanceRow>();
  for (const row of rows) {
    const seen = byEmail.get(row.email);
    if (!seen) {
      byEmail.set(row.email, { ...row });
      continue;
    }
    if (row.joinedAt && (!seen.joinedAt || row.joinedAt < seen.joinedAt))
      seen.joinedAt = row.joinedAt;
    if (row.leftAt && (!seen.leftAt || row.leftAt > seen.leftAt)) seen.leftAt = row.leftAt;
    if (row.durationMinutes !== null) {
      seen.durationMinutes =
        durations === "sum"
          ? (seen.durationMinutes ?? 0) + row.durationMinutes
          : Math.max(seen.durationMinutes ?? 0, row.durationMinutes);
    }
  }
  return [...byEmail.values()];
}

function isHeader(record: Record_): boolean {
  return record.cells.some((cell) => {
    // "email@example.com" in a plain list is an address, not a column name.
    if (asEmail(cell)) return false;
    const column = columnOf(normalizeHeader(cell));
    return column === "email" || column === "upn";
  });
}

function readSection(
  section: Record_[],
  timeZone: string,
): { rows: AttendanceRow[]; skipped: SkippedLine[]; headers: string[] } {
  const [header, ...body] = section;
  const headers = header!.cells.map(normalizeHeader);
  const columns = new Map<Column, number>();
  headers.forEach((name, index) => {
    const column = columnOf(name);
    if (column && !columns.has(column)) columns.set(column, index);
  });
  const durationHeader = headers.find((name) => columnOf(name) === "duration") ?? "";
  const unit = /sec|sek/.test(durationHeader) ? "seconds" : "minutes";
  const cell = (record: Record_, column: Column) => {
    const index = columns.get(column);
    return index === undefined ? "" : (record.cells[index] ?? "");
  };
  const rows: AttendanceRow[] = [];
  const skipped: SkippedLine[] = [];
  for (const record of body) {
    if (/^(no|nein|false|0)$/i.test(cell(record, "attended"))) continue;
    const email = asEmail(cell(record, "email")) ?? asEmail(cell(record, "upn"));
    if (email) {
      rows.push({
        line: record.line,
        email,
        joinedAt: parseAttendanceTime(cell(record, "joined"), timeZone),
        leftAt: parseAttendanceTime(cell(record, "left"), timeZone),
        durationMinutes: parseDuration(cell(record, "duration"), unit),
      });
      // A title between tables ("Panelist Details", "3. In-Meeting Activities") is no attendee.
    } else if (record.cells.filter(Boolean).length > 1) {
      skipped.push({ line: record.line, reason: "no_email", text: shorten(record.cells) });
    }
  }
  return { rows: merge(rows, "sum"), skipped, headers };
}

export function parseAttendanceCsv(text: string, options: { timeZone: string }): AttendanceParse {
  const all = records(text.replace(/^﻿/, ""), delimiterOf(text))
    .filter((record) => record.cells.some((cell) => cell !== ""))
    .slice(0, MAX_ATTENDANCE_ROWS);
  const firstHeader = all.findIndex(isHeader);

  // No header with an address column: a list of addresses, one per line (or anywhere in it).
  if (firstHeader === -1) {
    const rows: AttendanceRow[] = [];
    const skipped: SkippedLine[] = [];
    for (const record of all) {
      const found = record.cells
        .map((cell) => EMAIL_IN_TEXT.exec(cell)?.[0])
        .find((value): value is string => Boolean(value && asEmail(value)));
      if (found) {
        rows.push({
          line: record.line,
          email: asEmail(found)!,
          joinedAt: null,
          leftAt: null,
          durationMinutes: null,
        });
      } else skipped.push({ line: record.line, reason: "no_email", text: shorten(record.cells) });
    }
    return { format: "emails", rows: merge(rows), skipped };
  }

  // Lines before the first table are the report's summary; each header starts a table.
  const sections: Record_[][] = [];
  for (const record of all.slice(firstHeader)) {
    if (isHeader(record)) sections.push([record]);
    else sections.at(-1)!.push(record);
  }
  const read = sections.map((section) => readSection(section, options.timeZone));
  return {
    format: formatOf(read.flatMap((section) => section.headers)),
    rows: merge(
      read.flatMap((section) => section.rows),
      "max",
    ).sort((a, b) => a.line - b.line),
    skipped: read.flatMap((section) => section.skipped),
  };
}
