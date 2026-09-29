import { webinarEnd, webinarPhase, type WebinarTimes } from "@/core/webinars/phase";

/**
 * What a series asks of its live sessions (webinar brief §2.7): nothing, or
 * every session the course holds attended live — or, where the authors allow
 * it, watched as a re-live above the academy's threshold within the catch-up
 * window. The Certificate of Completion waits for it like for the work and
 * the test (core/courses/completion).
 */
export const SESSION_RULES = ["none", "attended_or_watched", "attended"] as const;
export type SessionRule = (typeof SESSION_RULES)[number];

export function isSessionRule(value: unknown): value is SessionRule {
  return typeof value === "string" && (SESSION_RULES as readonly string[]).includes(value);
}

/** The brief's example: "missed a session? watch the re-live within 7 days". */
export const DEFAULT_CATCH_UP_DAYS = 7;
export const MAX_CATCH_UP_DAYS = 365;

export function requiresSessions(rule: SessionRule): boolean {
  return rule !== "none";
}

/** What the course asks of its sessions: the rule and, for recordings, the window. */
export interface SessionRequirement {
  rule: SessionRule;
  /** Days after a session's end in which its recording still counts; null is no limit. */
  catchUpDays: number | null;
}

/**
 * Whether a new requirement lets through someone the old one held back:
 * then learners who meet it now get their credential at once. Stricter
 * rules never take a credential away.
 */
export function asksLessOfSessions(before: SessionRequirement, after: SessionRequirement): boolean {
  const strictness = { none: 0, attended_or_watched: 1, attended: 2 } as const;
  if (strictness[after.rule] !== strictness[before.rule]) {
    return strictness[after.rule] < strictness[before.rule];
  }
  if (after.rule !== "attended_or_watched") return false;
  if (after.catchUpDays === null) return before.catchUpDays !== null;
  return before.catchUpDays !== null && after.catchUpDays > before.catchUpDays;
}

const DAY = 24 * 60 * 60_000;

/** Until when a session's recording still counts; null when it always does. */
export function catchUpUntil(session: WebinarTimes, catchUpDays: number | null): Date | null {
  if (catchUpDays === null) return null;
  return new Date(webinarEnd(session).getTime() + catchUpDays * DAY);
}

/** One session of a course, with what the learner did about it. */
export interface SessionFacts extends WebinarTimes {
  status: "draft" | "published" | "cancelled";
  /** Checked in, in the tool's report or on the host's list. */
  attended: boolean;
  /** When the learner's watching of its recording first covered the academy's threshold. */
  watchedAt: Date | null;
}

/**
 * Where a learner stands with one session:
 * - `attended`: there live;
 * - `watched`: caught up on the recording, in time for the rule;
 * - `catch_up`: missed live, the recording still counts (until `catchUpUntil`);
 * - `missed`: missed, and nothing makes up for it any more;
 * - `upcoming`, `live`: still to come or running;
 * - `cancelled`: the academy cancelled it, so it asks nothing of anyone.
 * Under the rule `attended` a recording never stands in for the session.
 */
export type SessionOutcome =
  "attended" | "watched" | "catch_up" | "missed" | "upcoming" | "live" | "cancelled";

export function sessionOutcome(
  session: SessionFacts,
  requirement: SessionRequirement,
  now: Date,
): SessionOutcome {
  if (session.status === "cancelled") return "cancelled";
  if (session.attended) return "attended";
  const phase = webinarPhase(session, now);
  if (phase !== "ended") return phase;
  if (requirement.rule === "attended") return "missed";
  // Without a rule, the recording is there to learn from and has no deadline.
  const until = requirement.rule === "none" ? null : catchUpUntil(session, requirement.catchUpDays);
  if (session.watchedAt) {
    return until === null || session.watchedAt.getTime() <= until.getTime() ? "watched" : "missed";
  }
  return until === null || now.getTime() < until.getTime() ? "catch_up" : "missed";
}

/**
 * The learner's progress view (webinar brief §2.7): sessions done of those
 * that count, and the next one still to come (or running now).
 */
export function sessionsOverview<T extends { outcome: SessionOutcome; startsAt: Date }>(
  sessions: readonly T[],
): { total: number; done: number; next: T | null } {
  const counted = sessions.filter((session) => session.outcome !== "cancelled");
  const next = counted
    .filter((session) => session.outcome === "upcoming" || session.outcome === "live")
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
  return {
    total: counted.length,
    done: counted.filter(
      (session) => session.outcome === "attended" || session.outcome === "watched",
    ).length,
    next: next ?? null,
  };
}

/**
 * Session lessons "continue" skips: one still to come cannot be done yet,
 * a missed or cancelled one never will be. Running now, or open to catch
 * up on, it is where the learner goes next.
 */
export function waitingSessionKeys(
  sessions: ReadonlyArray<{ lessonKey: string; outcome: SessionOutcome }>,
): Set<string> {
  return new Set(
    sessions
      .filter((session) => ["upcoming", "missed", "cancelled"].includes(session.outcome))
      .map((session) => session.lessonKey),
  );
}

/** A session lesson is done once the learner was there or watched its recording. */
export function sessionLessonDone(session: Pick<SessionFacts, "attended" | "watchedAt">): boolean {
  return session.attended || session.watchedAt !== null;
}

export interface SessionsProgress {
  /** Sessions that count: all but the cancelled ones. */
  total: number;
  attended: number;
  /** Caught up on as a recording, in time. */
  watched: number;
  /** Every session that counts is attended or watched as the rule allows. */
  passed: boolean;
  /** What the credential says about the sessions (core/credentials/evidence). */
  evidence: Array<"attendance" | "relive">;
}

/**
 * The learner's sessions against the course's rule. Sessions not yet held
 * are missing, cancelled ones ask nothing, and neither does a draft nobody
 * can register for yet. The evidence is honest: live attendance only when
 * there was some, the recording only when it counted.
 */
export function sessionsProgress(
  sessions: readonly SessionFacts[],
  requirement: SessionRequirement,
  now: Date,
): SessionsProgress {
  const outcomes = sessions
    .filter((session) => session.status !== "draft")
    .map((session) => sessionOutcome(session, requirement, now));
  const counted = outcomes.filter((outcome) => outcome !== "cancelled");
  const attended = counted.filter((outcome) => outcome === "attended").length;
  const watched = counted.filter((outcome) => outcome === "watched").length;
  const evidence: SessionsProgress["evidence"] = [];
  if (requiresSessions(requirement.rule) && attended > 0) evidence.push("attendance");
  if (requiresSessions(requirement.rule) && watched > 0) evidence.push("relive");
  return {
    total: counted.length,
    attended,
    watched,
    passed: !requiresSessions(requirement.rule) || attended + watched === counted.length,
    evidence,
  };
}
