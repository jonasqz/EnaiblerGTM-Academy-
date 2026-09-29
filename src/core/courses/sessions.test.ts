import { describe, expect, it } from "vitest";

import {
  asksLessOfSessions,
  catchUpUntil,
  sessionLessonDone,
  sessionOutcome,
  sessionsOverview,
  sessionsProgress,
  waitingSessionKeys,
  type SessionFacts,
  type SessionRequirement,
} from "@/core/courses/sessions";

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const start = new Date("2026-10-06T16:00:00Z");
const end = new Date(start.getTime() + HOUR);

function session(overrides: Partial<SessionFacts> = {}): SessionFacts {
  return {
    startsAt: start,
    durationMinutes: 60,
    status: "published",
    attended: false,
    watchedAt: null,
    ...overrides,
  };
}

const attended: SessionRequirement = { rule: "attended", catchUpDays: 7 };
const either: SessionRequirement = { rule: "attended_or_watched", catchUpDays: 7 };
const none: SessionRequirement = { rule: "none", catchUpDays: null };

describe("where a learner stands with a session", () => {
  it("follows the clock until the session ends", () => {
    expect(sessionOutcome(session(), either, new Date(start.getTime() - HOUR))).toBe("upcoming");
    expect(sessionOutcome(session(), either, new Date(start.getTime() + 10 * 60_000))).toBe("live");
    expect(sessionOutcome(session({ attended: true }), either, start)).toBe("attended");
  });

  it("counts a recording watched within the catch-up window, to the millisecond", () => {
    const until = catchUpUntil(session(), 7)!;
    expect(until).toEqual(new Date(end.getTime() + 7 * DAY));
    const later = new Date(until.getTime() + DAY);
    expect(sessionOutcome(session({ watchedAt: until }), either, later)).toBe("watched");
    expect(
      sessionOutcome(session({ watchedAt: new Date(until.getTime() + 1) }), either, later),
    ).toBe("missed");
    // Before the window closes there is still time; afterwards there is none.
    expect(sessionOutcome(session(), either, new Date(until.getTime() - 1))).toBe("catch_up");
    expect(sessionOutcome(session(), either, until)).toBe("missed");
  });

  it("has no deadline without a window, and never accepts the recording for live-only", () => {
    const open: SessionRequirement = { rule: "attended_or_watched", catchUpDays: null };
    const years = new Date(end.getTime() + 900 * DAY);
    expect(catchUpUntil(session(), null)).toBeNull();
    expect(sessionOutcome(session(), open, years)).toBe("catch_up");
    expect(sessionOutcome(session({ watchedAt: years }), open, years)).toBe("watched");
    expect(sessionOutcome(session({ watchedAt: end }), attended, years)).toBe("missed");
    // Without a rule the recording is simply there to learn from.
    expect(sessionOutcome(session(), none, years)).toBe("catch_up");
  });

  it("asks nothing of a cancelled session", () => {
    expect(sessionOutcome(session({ status: "cancelled", attended: true }), attended, end)).toBe(
      "cancelled",
    );
  });

  it("marks the session's lesson done once the learner was there or watched it", () => {
    expect(sessionLessonDone({ attended: false, watchedAt: null })).toBe(false);
    expect(sessionLessonDone({ attended: true, watchedAt: null })).toBe(true);
    expect(sessionLessonDone({ attended: false, watchedAt: end })).toBe(true);
  });
});

describe("a learner's sessions against the course's rule", () => {
  const after = new Date(end.getTime() + 30 * DAY);
  const second = { startsAt: new Date(start.getTime() + 7 * DAY) };

  it("passes once every session that counts is attended, or caught up where allowed", () => {
    const sessions = [session({ attended: true }), session({ ...second, attended: true })];
    expect(sessionsProgress(sessions, attended, after)).toEqual({
      total: 2,
      attended: 2,
      watched: 0,
      passed: true,
      evidence: ["attendance"],
    });
    const caughtUp = [
      session({ attended: true }),
      session({ ...second, watchedAt: new Date(second.startsAt.getTime() + DAY) }),
    ];
    expect(sessionsProgress(caughtUp, either, after)).toMatchObject({
      passed: true,
      evidence: ["attendance", "relive"],
    });
    expect(sessionsProgress(caughtUp, attended, after)).toMatchObject({
      passed: false,
      attended: 1,
      watched: 0,
    });
  });

  it("names live attendance only when there was some", () => {
    const watchedAt = new Date(end.getTime() + DAY);
    expect(sessionsProgress([session({ watchedAt })], either, after).evidence).toEqual(["relive"]);
  });

  it("treats sessions not yet held as missing, cancelled ones and drafts as not there", () => {
    const upcoming = session({ startsAt: new Date(after.getTime() + DAY) });
    const cancelled = session({ ...second, status: "cancelled" });
    expect(
      sessionsProgress(
        [session({ attended: true }), session({ status: "draft" })],
        attended,
        after,
      ),
    ).toMatchObject({ total: 1, passed: true });
    expect(
      sessionsProgress([session({ attended: true }), upcoming], attended, after),
    ).toMatchObject({ total: 2, passed: false });
    expect(
      sessionsProgress([session({ attended: true }), cancelled], attended, after),
    ).toMatchObject({ total: 1, passed: true, evidence: ["attendance"] });
  });

  it("asks nothing, and claims nothing, without a rule", () => {
    expect(sessionsProgress([session({ attended: true })], none, after)).toMatchObject({
      passed: true,
      evidence: [],
    });
  });
});

describe("the learner's progress view", () => {
  it("counts sessions done and finds the next one", () => {
    const at = (days: number) => new Date(start.getTime() + days * DAY);
    const overview = sessionsOverview([
      { outcome: "attended" as const, startsAt: at(0) },
      { outcome: "cancelled" as const, startsAt: at(3) },
      { outcome: "upcoming" as const, startsAt: at(14) },
      { outcome: "upcoming" as const, startsAt: at(7) },
      { outcome: "catch_up" as const, startsAt: at(1) },
    ]);
    expect(overview.total).toBe(4);
    expect(overview.done).toBe(1);
    expect(overview.next?.startsAt).toEqual(at(7));
    expect(sessionsOverview([{ outcome: "watched" as const, startsAt: at(0) }]).next).toBeNull();
  });

  it("lets 'continue' skip sessions that cannot be done now", () => {
    const keys = waitingSessionKeys([
      { lessonKey: "kick-off", outcome: "upcoming" },
      { lessonKey: "live", outcome: "live" },
      { lessonKey: "catch-up", outcome: "catch_up" },
      { lessonKey: "gone", outcome: "missed" },
      { lessonKey: "off", outcome: "cancelled" },
      { lessonKey: "done", outcome: "attended" },
    ]);
    expect([...keys].sort()).toEqual(["gone", "kick-off", "off"]);
  });
});

describe("changing the rule", () => {
  it("knows when learners may now qualify", () => {
    expect(asksLessOfSessions(attended, either)).toBe(true);
    expect(asksLessOfSessions(either, none)).toBe(true);
    expect(asksLessOfSessions(none, attended)).toBe(false);
    expect(asksLessOfSessions(either, { ...either, catchUpDays: 14 })).toBe(true);
    expect(asksLessOfSessions(either, { ...either, catchUpDays: null })).toBe(true);
    expect(asksLessOfSessions({ ...either, catchUpDays: null }, either)).toBe(false);
    expect(asksLessOfSessions(either, { ...either, catchUpDays: 3 })).toBe(false);
  });
});
