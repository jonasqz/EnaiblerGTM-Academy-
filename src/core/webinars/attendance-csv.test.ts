import { describe, expect, it } from "vitest";

import {
  decodeAttendanceFile,
  parseAttendanceCsv,
  parseAttendanceTime,
  parseDuration,
} from "@/core/webinars/attendance-csv";

const zone = { timeZone: "Europe/Berlin" };

describe("attendance files", () => {
  it("reads Zoom's participant report, adding up rejoins", () => {
    const csv = [
      "Name (Original Name),User Email,Join Time,Leave Time,Duration (Minutes),Guest,Recording Consent",
      "Ada Lovelace,ada@example.com,10/06/2026 06:01:12 PM,10/06/2026 06:30:00 PM,29,No,Y",
      "Ada Lovelace,ADA@example.com,10/06/2026 06:35:00 PM,10/06/2026 07:00:10 PM,26,No,Y",
      "Grace,grace@example.com,10/06/2026 06:00:00 PM,10/06/2026 07:00:00 PM,60,Yes,Y",
      "Phone caller,,10/06/2026 06:10:00 PM,10/06/2026 06:20:00 PM,10,Yes,",
    ].join("\n");
    const result = parseAttendanceCsv(csv, zone);
    expect(result.format).toBe("zoom");
    expect(result.rows).toEqual([
      {
        line: 2,
        email: "ada@example.com",
        joinedAt: new Date("2026-10-06T16:01:12Z"),
        leftAt: new Date("2026-10-06T17:00:10Z"),
        durationMinutes: 55,
      },
      {
        line: 4,
        email: "grace@example.com",
        joinedAt: new Date("2026-10-06T16:00:00Z"),
        leftAt: new Date("2026-10-06T17:00:00Z"),
        durationMinutes: 60,
      },
    ]);
    expect(result.skipped).toEqual([
      {
        line: 5,
        reason: "no_email",
        text: "Phone caller, 10/06/2026 06:10:00 PM, 10/06/2026 06:20:00 PM, 10, Yes",
      },
    ]);
  });

  it("reads Zoom's webinar report with its summary, sections and no-shows", () => {
    const csv = [
      "Attendee Report,",
      "Report Generated:,10/06/2026 08:00 PM",
      "Topic,Webinar ID,Actual Start Time",
      "Pricing live,123 456 789,10/06/2026 06:00 PM",
      "Host Details,",
      "Attended,User Name (Original Name),Email,Join Time,Leave Time,Time in Session (minutes)",
      "Yes,Host,host@academy.example.com,10/06/2026 05:50 PM,10/06/2026 07:05 PM,75",
      "Attendee Details,",
      "Attended,User Name (Original Name),Email,Join Time,Leave Time,Time in Session (minutes)",
      "Yes,Ada,ada@example.com,10/06/2026 06:02 PM,10/06/2026 06:58 PM,56",
      "No,Linus,linus@example.com,--,--,--",
    ].join("\n");
    const result = parseAttendanceCsv(csv, zone);
    expect(result.format).toBe("zoom");
    expect(result.rows.map((row) => [row.email, row.durationMinutes])).toEqual([
      ["host@academy.example.com", 75],
      ["ada@example.com", 56],
    ]);
    expect(result.skipped).toEqual([]);
  });

  it("reads the Teams attendance list (UTF-16, tabs, German), counting each person once", () => {
    const text = [
      "1. Zusammenfassung",
      "Besprechungstitel\tPricing live",
      "Teilnehmer\t2",
      "",
      "2. Teilnehmer",
      "Name\tErster Beitritt\tLetztes Verlassen\tDauer der Besprechung\tE-Mail\tTeilnehmer-ID (UPN)\tRolle",
      "Ada Lovelace\t06.10.26, 18:01:00\t06.10.26, 19:00:00\t59 Min. 0 Sek.\tada@example.com\tada@example.com\tTeilnehmer",
      "Gast\t06.10.26, 18:05:00\t06.10.26, 18:20:00\t15 Min.\t\tgast@partner.example\tTeilnehmer",
      "",
      "3. Aktivitäten in der Besprechung",
      "Name\tBeitreten\tVerlassen\tDauer\tE-Mail\tRolle",
      "Ada Lovelace\t06.10.26, 18:01:00\t06.10.26, 18:30:00\t29 Min.\tada@example.com\tTeilnehmer",
      "Ada Lovelace\t06.10.26, 18:30:00\t06.10.26, 19:00:00\t30 Min.\tada@example.com\tTeilnehmer",
    ].join("\r\n");
    const bytes = new Uint8Array([
      0xff,
      0xfe,
      ...new Uint8Array(new Uint16Array([...text].map((c) => c.charCodeAt(0))).buffer),
    ]);
    const decoded = decodeAttendanceFile(bytes);
    expect(decoded).toBe(text);
    const result = parseAttendanceCsv(decoded, zone);
    expect(result.format).toBe("teams");
    expect(result.rows).toEqual([
      {
        line: 7,
        email: "ada@example.com",
        joinedAt: new Date("2026-10-06T16:01:00Z"),
        leftAt: new Date("2026-10-06T17:00:00Z"),
        durationMinutes: 59,
      },
      {
        line: 8,
        email: "gast@partner.example",
        joinedAt: new Date("2026-10-06T16:05:00Z"),
        leftAt: new Date("2026-10-06T16:20:00Z"),
        durationMinutes: 15,
      },
    ]);
  });

  it("reads a Meet attendance sheet in English", () => {
    const csv = [
      "First name,Last name,Email,Duration,Time joined,Time exited",
      "Ada,Lovelace,ada@example.com,58 min,18:02,19:00",
      "Grace,Hopper,grace@example.com,1 hr 2 min,17:58,19:00",
    ].join("\n");
    const result = parseAttendanceCsv(csv, zone);
    expect(result.format).toBe("meet");
    expect(result.rows.map((row) => [row.email, row.durationMinutes, row.joinedAt])).toEqual([
      ["ada@example.com", 58, null],
      ["grace@example.com", 62, null],
    ]);
  });

  it("reads a plain list of addresses, and a semicolon table from a German spreadsheet", () => {
    const list = parseAttendanceCsv(
      "ada@example.com\nGrace Hopper <grace@example.com>\n\nnot an address\n",
      zone,
    );
    expect(list.format).toBe("emails");
    expect(list.rows.map((row) => row.email)).toEqual(["ada@example.com", "grace@example.com"]);
    expect(list.skipped).toEqual([{ line: 4, reason: "no_email", text: "not an address" }]);

    const table = parseAttendanceCsv(
      '﻿Name;E-Mail-Adresse\n"Lovelace; Ada";ada@example.com\n',
      zone,
    );
    expect(table.format).toBe("table");
    expect(table.rows.map((row) => row.email)).toEqual(["ada@example.com"]);
  });

  it("reads durations and times the way the tools write them", () => {
    expect(parseDuration("62")).toBe(62);
    expect(parseDuration("90", "seconds")).toBe(2);
    expect(parseDuration("1:02:30")).toBe(63);
    expect(parseDuration("45:30")).toBe(46);
    expect(parseDuration("1h 2m 3s")).toBe(62);
    expect(parseDuration("1 Std. 5 Min.")).toBe(65);
    expect(parseDuration("--")).toBeNull();
    expect(parseDuration("")).toBeNull();
    expect(parseAttendanceTime("2026-10-06T16:00:00Z", "Europe/Berlin")).toEqual(
      new Date("2026-10-06T16:00:00Z"),
    );
    expect(parseAttendanceTime("2026-10-06 18:00:00", "Europe/Berlin")).toEqual(
      new Date("2026-10-06T16:00:00Z"),
    );
    expect(parseAttendanceTime("10/6/26, 6:00:00 PM", "Europe/Berlin")).toEqual(
      new Date("2026-10-06T16:00:00Z"),
    );
    expect(parseAttendanceTime("06.10.2026 18:00", "Europe/Berlin")).toEqual(
      new Date("2026-10-06T16:00:00Z"),
    );
    expect(parseAttendanceTime("sometime", "Europe/Berlin")).toBeNull();
  });
});
