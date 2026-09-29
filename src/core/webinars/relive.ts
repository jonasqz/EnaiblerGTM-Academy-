import type { MediaAccess } from "@/core/media/access";
import {
  webinarEnd,
  webinarPhase,
  type WebinarStatus,
  type WebinarTimes,
} from "@/core/webinars/phase";
import { isConfirmed, type RegistrationStatus } from "@/core/webinars/registration";

/**
 * Who may watch a webinar's recording (webinar brief §2.4, §5). Private by
 * default: registrants only. Showing it to every learner or to the public
 * needs the host to confirm that attendees' faces, voices and names are out
 * of the recording or that they agreed.
 */
export const RELIVE_ACCESS = ["registrants", "learners", "public"] as const;
export type ReliveAccess = (typeof RELIVE_ACCESS)[number];

export function isReliveAccess(value: unknown): value is ReliveAccess {
  return typeof value === "string" && (RELIVE_ACCESS as readonly string[]).includes(value);
}

const REACH: Record<ReliveAccess, number> = { registrants: 0, learners: 1, public: 2 };

/** Whether a change shows the recording to more people than before. */
export function widensAccess(from: ReliveAccess, to: ReliveAccess): boolean {
  return REACH[to] > REACH[from];
}

export type ReliveAccessChange =
  | { ok: true; access: ReliveAccess; confirmation: "keep" | "record" | "clear" }
  | { ok: false; issue: "confirmation_missing" | "no_recording" };

/**
 * A change of who may watch. Narrowing always goes through. Widening needs
 * a recording to confirm it for and the host's tick, recorded with who and
 * when; every widening asks again. Back at registrants the confirmation is
 * dropped, so a wider audience later needs a new one.
 */
export function changeReliveAccess(
  current: ReliveAccess,
  next: ReliveAccess,
  input: { confirmed: boolean; hasRecording: boolean },
): ReliveAccessChange {
  if (!widensAccess(current, next)) {
    return { ok: true, access: next, confirmation: next === "registrants" ? "clear" : "keep" };
  }
  if (!input.hasRecording) return { ok: false, issue: "no_recording" };
  if (!input.confirmed) return { ok: false, issue: "confirmation_missing" };
  return { ok: true, access: next, confirmation: "record" };
}

/** The recording's own access follows the webinar: the levels share their names. */
export function mediaAccessFor(access: ReliveAccess): MediaAccess {
  return access;
}

/**
 * What a webinar's page offers of its recording (webinar brief §3, evergreen
 * pages): nothing, a promise while the video is being prepared, or the
 * recording itself. Only once a published webinar has ended; a failed video
 * promises nothing until the host fixes it.
 */
export type ReliveState = "none" | "coming" | "ready";

export function reliveState(
  webinar: WebinarTimes & { status: WebinarStatus },
  recording: { status: "processing" | "ready" | "failed" } | null,
  now: Date,
): ReliveState {
  if (!recording || webinar.status !== "published") return "none";
  if (webinarPhase(webinar, now) !== "ended") return "none";
  if (recording.status === "ready") return "ready";
  return recording.status === "processing" ? "coming" : "none";
}

/**
 * The mail that brings the recording: those who were there watch it again,
 * those who registered and missed it catch up, and those who registered
 * after the end for the recording simply hear that it is ready.
 */
export type ReliveMailVariant = "again" | "missed" | "ready";

export function reliveMailVariant(input: {
  attended: boolean;
  confirmedAt: Date | null;
  end: Date;
}): ReliveMailVariant {
  if (input.attended) return "again";
  if (input.confirmedAt && input.confirmedAt.getTime() >= input.end.getTime()) return "ready";
  return "missed";
}

/** Whether someone's watching counts: at least the academy's threshold of the video. */
export function watchedRecording(percent: number | null, thresholdPercent: number): boolean {
  return percent !== null && percent >= thresholdPercent;
}

export interface CatchUp {
  /** Registered before the end and did not attend. */
  missed: number;
  /** Of them, the ones who watched the recording past the threshold. */
  caughtUp: number;
  /** Whole percent, or null while nobody missed it. */
  rate: number | null;
}

/**
 * The no-show catch-up rate (webinar brief §3, §8): of those who registered
 * for the session (a seat or the waitlist) and did not attend, the share who
 * watched the recording. People who registered after the end came for the
 * recording, so they are no no-shows.
 */
export function catchUpRate(
  registrants: ReadonlyArray<{
    status: RegistrationStatus;
    confirmedAt: Date | null;
    attended: boolean;
    watchedPercent: number | null;
  }>,
  webinar: WebinarTimes,
  thresholdPercent: number,
): CatchUp {
  const end = webinarEnd(webinar).getTime();
  const missed = registrants.filter(
    (row) =>
      isConfirmed(row.status) &&
      row.confirmedAt !== null &&
      row.confirmedAt.getTime() < end &&
      !row.attended,
  );
  const caughtUp = missed.filter((row) =>
    watchedRecording(row.watchedPercent, thresholdPercent),
  ).length;
  return {
    missed: missed.length,
    caughtUp,
    rate: missed.length ? Math.round((caughtUp / missed.length) * 100) : null,
  };
}
