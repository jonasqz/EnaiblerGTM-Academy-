import { describe, expect, it } from "vitest";

import { registrationOpen } from "@/core/webinars/phase";
import {
  catchUpRate,
  changeReliveAccess,
  isReliveAccess,
  mediaAccessFor,
  reliveMailVariant,
  reliveState,
  watchedRecording,
  widensAccess,
} from "@/core/webinars/relive";
import { webinarMailDue } from "@/core/webinars/reminders";
import { formatWebinarDate } from "@/core/webinars/time";

const start = new Date("2026-10-06T16:00:00Z");
const webinar = { startsAt: start, durationMinutes: 60, status: "published" as const };
const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);

describe("who may watch a recording (webinar brief §5)", () => {
  it("knows its three levels, registrants being the narrowest", () => {
    expect(isReliveAccess("registrants")).toBe(true);
    expect(isReliveAccess("everyone")).toBe(false);
    expect(widensAccess("registrants", "learners")).toBe(true);
    expect(widensAccess("learners", "public")).toBe(true);
    expect(widensAccess("public", "registrants")).toBe(false);
    expect(widensAccess("learners", "learners")).toBe(false);
  });

  it("widens only with a recording and the host's confirmation, every time", () => {
    const confirmed = { confirmed: true, hasRecording: true };
    expect(changeReliveAccess("registrants", "public", { ...confirmed, confirmed: false })).toEqual(
      { ok: false, issue: "confirmation_missing" },
    );
    expect(
      changeReliveAccess("registrants", "learners", { ...confirmed, hasRecording: false }),
    ).toEqual({ ok: false, issue: "no_recording" });
    expect(changeReliveAccess("registrants", "learners", confirmed)).toEqual({
      ok: true,
      access: "learners",
      confirmation: "record",
    });
    // From learners to the public is wider again: another tick.
    expect(changeReliveAccess("learners", "public", { ...confirmed, confirmed: false })).toEqual({
      ok: false,
      issue: "confirmation_missing",
    });
  });

  it("narrows without asking, and back at registrants forgets the confirmation", () => {
    const unconfirmed = { confirmed: false, hasRecording: true };
    expect(changeReliveAccess("public", "learners", unconfirmed)).toEqual({
      ok: true,
      access: "learners",
      confirmation: "keep",
    });
    expect(changeReliveAccess("public", "registrants", unconfirmed)).toEqual({
      ok: true,
      access: "registrants",
      confirmation: "clear",
    });
    // Without a recording too: narrowing is always possible.
    expect(
      changeReliveAccess("learners", "registrants", { confirmed: false, hasRecording: false }),
    ).toMatchObject({ ok: true });
  });

  it("gives the video the same level", () => {
    expect(mediaAccessFor("registrants")).toBe("registrants");
    expect(mediaAccessFor("public")).toBe("public");
  });
});

describe("the evergreen page (webinar brief §3)", () => {
  it("offers the recording only once a published webinar has ended", () => {
    const ready = { status: "ready" as const };
    expect(reliveState(webinar, ready, at(30))).toBe("none");
    expect(reliveState(webinar, ready, at(60))).toBe("ready");
    expect(reliveState(webinar, { status: "processing" }, at(60))).toBe("coming");
    // A failed video promises nothing; no video, nothing either.
    expect(reliveState(webinar, { status: "failed" }, at(60))).toBe("none");
    expect(reliveState(webinar, null, at(60))).toBe("none");
    expect(reliveState({ ...webinar, status: "cancelled" }, ready, at(60))).toBe("none");
  });

  it("keeps registration open after the end while there is a recording", () => {
    expect(registrationOpen(webinar, at(60))).toBe(false);
    expect(registrationOpen(webinar, at(60), "coming")).toBe(true);
    expect(registrationOpen(webinar, at(60 * 24 * 90), "ready")).toBe(true);
    expect(registrationOpen({ ...webinar, status: "cancelled" }, at(60), "ready")).toBe(false);
  });

  it("says when it was recorded, in the webinar's zone", () => {
    expect(formatWebinarDate(new Date("2026-10-06T22:30:00Z"), "Europe/Berlin", "de")).toBe(
      "7. Oktober 2026",
    );
    expect(formatWebinarDate(start, "Europe/Berlin", "en")).toBe("6 October 2026");
  });
});

describe("the recording by mail", () => {
  const end = at(60);

  it("thanks attendees, catches up no-shows, and tells late registrants it's ready", () => {
    expect(reliveMailVariant({ attended: true, confirmedAt: at(-600), end })).toBe("again");
    expect(reliveMailVariant({ attended: false, confirmedAt: at(-600), end })).toBe("missed");
    expect(reliveMailVariant({ attended: false, confirmedAt: at(24 * 60), end })).toBe("ready");
  });

  it("goes to a seat or the waitlist of a published webinar", () => {
    const state = { webinar: "published" as const, startsAt: start };
    expect(webinarMailDue("relive", { ...state, registration: "registered" })).toBe("send");
    expect(webinarMailDue("relive", { ...state, registration: "waitlist" })).toBe("send");
    expect(webinarMailDue("relive", { ...state, registration: "cancelled" })).toBe("superseded");
    expect(
      webinarMailDue("relive", { ...state, registration: "registered", webinar: "cancelled" }),
    ).toBe("webinar_cancelled");
    expect(webinarMailDue("relive_confirmation", { ...state, registration: "registered" })).toBe(
      "send",
    );
  });
});

describe("the no-show catch-up rate (webinar brief §8)", () => {
  const before = at(-600);
  const row = (
    status: "registered" | "waitlist" | "cancelled",
    attended: boolean,
    watchedPercent: number | null,
    confirmedAt: Date | null = before,
  ) => ({ status, attended, watchedPercent, confirmedAt });

  it("counts registrants who missed it and watched past the threshold", () => {
    const rows = [
      row("registered", true, 100), // attended: no no-show
      row("registered", false, 85), // caught up
      row("waitlist", false, 90), // caught up from the waitlist
      row("registered", false, 40), // started, not enough
      row("registered", false, null), // never pressed play
      row("cancelled", false, 100), // cancelled: not a registrant any more
      row("registered", false, 100, at(24 * 60)), // registered for the recording
    ];
    expect(catchUpRate(rows, webinar, 80)).toEqual({ missed: 4, caughtUp: 2, rate: 50 });
  });

  it("has no rate while nobody missed it", () => {
    expect(catchUpRate([row("registered", true, null)], webinar, 80)).toEqual({
      missed: 0,
      caughtUp: 0,
      rate: null,
    });
  });

  it("counts watching against the threshold as it is now", () => {
    expect(watchedRecording(80, 80)).toBe(true);
    expect(watchedRecording(79, 80)).toBe(false);
    expect(watchedRecording(null, 0)).toBe(false);
  });
});
