import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import {
  catchUpUntil,
  sessionLessonDone,
  sessionOutcome,
  type SessionFacts,
  type SessionOutcome,
  type SessionRequirement,
} from "@/core/courses/sessions";
import { checkinOpen, joinLinkVisible } from "@/core/webinars/phase";
import type { Transaction } from "@/db/client";
import {
  enrollments,
  lessons,
  watchProgress,
  webinarAttendance,
  webinarRegistrations,
  webinars,
} from "@/db/schema";
import type { LessonBlock } from "@/db/schema/catalog";
import { trackEvent } from "@/server/events";

/*
 * The live sessions of a course (webinar brief §2.5, §2.7): lessons that are
 * a webinar of the academy belonging to the course. The lesson carries the
 * webinar in every language it exists in; a webinar that was deleted or
 * moved to another course is no session of this one.
 */

type WebinarRow = typeof webinars.$inferSelect;

/** The webinar a session lesson is (webinar brief §2.5), or null for any other lesson. */
export function webinarIdOf(blocks: readonly LessonBlock[]): string | null {
  const block = blocks.find(
    (candidate): candidate is Extract<LessonBlock, { type: "webinar" }> =>
      candidate.type === "webinar",
  );
  return block?.webinarId ?? null;
}

export interface CourseSession {
  lessonKey: string;
  webinar: WebinarRow;
}

/** The course's sessions in lesson order, each webinar once. */
export async function courseSessions(tx: Transaction, courseId: string): Promise<CourseSession[]> {
  const rows = await tx
    .select({ key: lessons.key, blocks: lessons.blocks })
    .from(lessons)
    .where(eq(lessons.courseId, courseId))
    .orderBy(asc(lessons.position), asc(lessons.locale));
  const byKey = new Map<string, string>();
  for (const row of rows) {
    const webinarId = webinarIdOf(row.blocks);
    if (webinarId && !byKey.has(row.key)) byKey.set(row.key, webinarId);
  }
  if (byKey.size === 0) return [];
  const found = await tx
    .select()
    .from(webinars)
    .where(
      and(inArray(webinars.id, [...new Set(byKey.values())]), eq(webinars.courseId, courseId)),
    );
  const seen = new Set<string>();
  const sessions: CourseSession[] = [];
  for (const [lessonKey, webinarId] of byKey) {
    const webinar = found.find((row) => row.id === webinarId);
    if (!webinar || seen.has(webinar.id)) continue;
    seen.add(webinar.id);
    sessions.push({ lessonKey, webinar });
  }
  return sessions;
}

/** What one learner did about each session: there live, and when they watched its recording. */
export async function learnerSessionFacts(
  tx: Transaction,
  userId: string,
  sessions: readonly CourseSession[],
): Promise<Array<CourseSession & SessionFacts>> {
  if (sessions.length === 0) return [];
  const attended = new Set(
    (
      await tx
        .select({ webinarId: webinarAttendance.webinarId })
        .from(webinarAttendance)
        .where(
          and(
            eq(webinarAttendance.userId, userId),
            inArray(
              webinarAttendance.webinarId,
              sessions.map((session) => session.webinar.id),
            ),
          ),
        )
    ).map((row) => row.webinarId),
  );
  const recordings = sessions
    .map((session) => session.webinar.recordingAssetId)
    .filter((id): id is string => id !== null);
  const watched = recordings.length
    ? await tx
        .select({ assetId: watchProgress.assetId, at: watchProgress.thresholdReachedAt })
        .from(watchProgress)
        .where(
          and(
            eq(watchProgress.userId, userId),
            inArray(watchProgress.assetId, recordings),
            isNotNull(watchProgress.thresholdReachedAt),
          ),
        )
    : [];
  return sessions.map((session) => ({
    ...session,
    startsAt: session.webinar.startsAt,
    durationMinutes: session.webinar.durationMinutes,
    status: session.webinar.status,
    attended: attended.has(session.webinar.id),
    watchedAt: watched.find((row) => row.assetId === session.webinar.recordingAssetId)?.at ?? null,
  }));
}

/** A session as its learner (or a visitor) sees it in the course. */
export interface LearnerSession {
  lessonKey: string;
  /** What the course may show: never the join link or the check-in code. */
  webinar: Pick<
    WebinarRow,
    | "id"
    | "slug"
    | "title"
    | "locale"
    | "startsAt"
    | "durationMinutes"
    | "timeZone"
    | "status"
    | "recorded"
    | "recordingNotice"
    | "recordingAssetId"
  >;
  registration: { id: string; status: "pending" | "registered" | "waitlist" | "cancelled" } | null;
  startsAt: Date;
  attended: boolean;
  watchedAt: Date | null;
  outcome: SessionOutcome;
  /** Until when its recording counts, when the course lets it stand in and sets a window. */
  catchUpUntil: Date | null;
  /** Only for a seat, and only from shortly before the start until the end. */
  joinUrl: string | null;
  checkinOpen: boolean;
}

/** The course's sessions with where the learner stands with each (a visitor: nowhere yet). */
export async function learnerSessions(
  tx: Transaction,
  input: {
    courseId: string;
    userId: string | null;
    requirement: SessionRequirement;
    now: Date;
  },
): Promise<LearnerSession[]> {
  const sessions = await courseSessions(tx, input.courseId);
  if (sessions.length === 0) return [];
  const facts = input.userId
    ? await learnerSessionFacts(tx, input.userId, sessions)
    : sessions.map((session) => ({
        ...session,
        startsAt: session.webinar.startsAt,
        durationMinutes: session.webinar.durationMinutes,
        status: session.webinar.status,
        attended: false,
        watchedAt: null,
      }));
  const registrations = input.userId
    ? await tx
        .select({
          id: webinarRegistrations.id,
          webinarId: webinarRegistrations.webinarId,
          status: webinarRegistrations.status,
        })
        .from(webinarRegistrations)
        .where(
          and(
            eq(webinarRegistrations.userId, input.userId),
            inArray(
              webinarRegistrations.webinarId,
              sessions.map((session) => session.webinar.id),
            ),
          ),
        )
    : [];
  return (
    facts
      // Drafts are the authors' business until they are published.
      .filter((session) => session.webinar.status !== "draft")
      .map((session) => {
        const { webinar } = session;
        const registration = registrations.find((row) => row.webinarId === webinar.id) ?? null;
        const seated = registration?.status === "registered" && webinar.status === "published";
        return {
          lessonKey: session.lessonKey,
          webinar: {
            id: webinar.id,
            slug: webinar.slug,
            title: webinar.title,
            locale: webinar.locale,
            startsAt: webinar.startsAt,
            durationMinutes: webinar.durationMinutes,
            timeZone: webinar.timeZone,
            status: webinar.status,
            recorded: webinar.recorded,
            recordingNotice: webinar.recordingNotice,
            recordingAssetId: webinar.recordingAssetId,
          },
          registration: registration ? { id: registration.id, status: registration.status } : null,
          startsAt: webinar.startsAt,
          attended: session.attended,
          watchedAt: session.watchedAt,
          outcome: sessionOutcome(session, input.requirement, input.now),
          catchUpUntil:
            input.requirement.rule === "attended_or_watched"
              ? catchUpUntil(webinar, input.requirement.catchUpDays)
              : null,
          joinUrl: seated && joinLinkVisible(webinar, input.now) ? webinar.joinUrl : null,
          checkinOpen: seated && !session.attended && checkinOpen(webinar, input.now),
        };
      })
  );
}

/**
 * Session lessons complete themselves (they have no "done" button): once
 * the learner was there or watched the recording, in the transaction that
 * recorded it. Returns the lessons it marked.
 */
export async function markSessionLessons(
  tx: Transaction,
  tenantId: string,
  input: { userId: string; courseId: string },
): Promise<string[]> {
  const [enrollment] = await tx
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.courseId, input.courseId), eq(enrollments.userId, input.userId)))
    .for("update");
  if (!enrollment) return [];
  const facts = await learnerSessionFacts(
    tx,
    input.userId,
    await courseSessions(tx, input.courseId),
  );
  const done = facts
    .filter(
      (session) => sessionLessonDone(session) && !enrollment.lessonProgress[session.lessonKey],
    )
    .map((session) => session.lessonKey);
  if (done.length === 0) return [];
  const at = new Date().toISOString();
  await tx
    .update(enrollments)
    .set({
      lessonProgress: sql`${enrollments.lessonProgress} || ${JSON.stringify(
        Object.fromEntries(done.map((key) => [key, { completedAt: at }])),
      )}::jsonb`,
    })
    .where(eq(enrollments.id, enrollment.id));
  for (const key of done) {
    await trackEvent(tx, {
      tenantId,
      name: "lesson_completed",
      userId: input.userId,
      courseId: input.courseId,
      pathId: enrollment.pathId,
      locale: enrollment.locale,
      entry: enrollment.entryContext,
      props: { lesson: key, session: true },
    });
  }
  return done;
}
