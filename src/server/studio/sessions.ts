import { and, inArray, isNotNull, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { watchProgress, webinarAttendance, webinarRegistrations } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { courseSessions } from "@/server/courses/sessions";

/*
 * A series in the Studio (webinar brief §3, funnel per session and series):
 * each session of the course with how many have a seat or wait for one, how
 * many were there and how many watched its recording past the academy's
 * threshold. Numbers only: no learner appears here.
 */

export interface SessionNumbers {
  webinarId: string;
  lessonKey: string;
  title: string;
  startsAt: Date;
  durationMinutes: number;
  status: "draft" | "published" | "cancelled";
  registered: number;
  waitlist: number;
  attended: number;
  watched: number;
}

export async function courseSessionNumbers(
  db: Database,
  tenantId: string,
  courseId: string,
): Promise<SessionNumbers[]> {
  return withTenant(db, tenantId, async (tx) => {
    const sessions = await courseSessions(tx, courseId);
    if (sessions.length === 0) return [];
    const ids = sessions.map((session) => session.webinar.id);
    const seats = await tx
      .select({
        webinarId: webinarRegistrations.webinarId,
        status: webinarRegistrations.status,
        n: sql<number>`count(*)::int`,
      })
      .from(webinarRegistrations)
      .where(
        and(
          inArray(webinarRegistrations.webinarId, ids),
          inArray(webinarRegistrations.status, ["registered", "waitlist"]),
        ),
      )
      .groupBy(webinarRegistrations.webinarId, webinarRegistrations.status);
    const attendance = await tx
      .select({ webinarId: webinarAttendance.webinarId, n: sql<number>`count(*)::int` })
      .from(webinarAttendance)
      .where(inArray(webinarAttendance.webinarId, ids))
      .groupBy(webinarAttendance.webinarId);
    const recordings = sessions
      .map((session) => session.webinar.recordingAssetId)
      .filter((id): id is string => id !== null);
    const watching = recordings.length
      ? await tx
          .select({ assetId: watchProgress.assetId, n: sql<number>`count(*)::int` })
          .from(watchProgress)
          .where(
            and(
              inArray(watchProgress.assetId, recordings),
              isNotNull(watchProgress.thresholdReachedAt),
            ),
          )
          .groupBy(watchProgress.assetId)
      : [];
    const count = (rows: Array<{ n: number }>) => rows.reduce((sum, row) => sum + row.n, 0);
    return sessions.map(({ lessonKey, webinar }) => ({
      webinarId: webinar.id,
      lessonKey,
      title: webinar.title,
      startsAt: webinar.startsAt,
      durationMinutes: webinar.durationMinutes,
      status: webinar.status,
      registered: count(
        seats.filter((row) => row.webinarId === webinar.id && row.status === "registered"),
      ),
      waitlist: count(
        seats.filter((row) => row.webinarId === webinar.id && row.status === "waitlist"),
      ),
      attended: count(attendance.filter((row) => row.webinarId === webinar.id)),
      watched: webinar.recordingAssetId
        ? count(watching.filter((row) => row.assetId === webinar.recordingAssetId))
        : 0,
    }));
  });
}
