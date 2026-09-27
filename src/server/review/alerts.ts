import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import type { LocalizedText } from "@/core/i18n/locales";
import { reviewAlertScope, reviewAlertSendAfter } from "@/core/notifications/rules";
import { learnerAlias } from "@/core/people/alias";
import { reviewQueueKind, type QueueKind } from "@/core/review/outcome";
import type { Transaction } from "@/db/client";
import {
  assignments,
  courses,
  notifications,
  REVIEW_WAITING_PENDING,
  reviews,
  submissions,
  type ReviewRoutingRecord,
} from "@/db/schema";
import { mentorMaySee, mentorScope } from "@/server/cohorts";
import { rolesOf, signedInTeam } from "@/server/team";

/*
 * Review alerts (brief §8, human in the loop): a hand-in that waits for a
 * person, held by the routing or picked for a spot check, is mailed to the
 * team members who may decide it, so feedback does not sit for days. Mentors
 * only hear about their cohorts, like their review queue. One mail an hour
 * per person at most (core/notifications/rules.ts); learners appear only by
 * their alias, and no mail carries any of their work.
 */

/** When the last review alert went out to someone. */
export async function lastReviewAlertAt(tx: Transaction, userId: string): Promise<Date | null> {
  const [row] = await tx
    .select({ at: notifications.processedAt })
    .from(notifications)
    .where(
      and(
        eq(notifications.kind, "review_waiting"),
        eq(notifications.userId, userId),
        eq(notifications.status, "sent"),
      ),
    )
    .orderBy(desc(notifications.processedAt))
    .limit(1);
  return row?.at ?? null;
}

/**
 * Called in the transaction that makes a hand-in wait for a person (the
 * review job), so an alert exists exactly when the hand-in does wait. Each
 * person has at most one alert waiting to go out; the hand-in joins it.
 * Alerts go only to people who have signed in: an address typed wrong gets
 * one invitation, never a stream of these.
 */
export async function queueReviewAlerts(
  tx: Transaction,
  tenantId: string,
  submissionId: string,
): Promise<number> {
  const [submission] = await tx
    .select({ userId: submissions.userId })
    .from(submissions)
    .where(eq(submissions.id, submissionId));
  if (!submission) return 0;
  const now = new Date();
  let queued = 0;
  for (const member of await signedInTeam(tx)) {
    // A team member who took the course themselves does not review their own work.
    if (member.userId === submission.userId) continue;
    const scope = reviewAlertScope(member.roles);
    if (!scope) continue;
    if (scope === "cohorts" && !(await mentorMaySee(tx, member.userId, submissionId))) continue;
    const sendAfter = reviewAlertSendAfter(now, await lastReviewAlertAt(tx, member.userId));
    await tx
      .insert(notifications)
      .values({
        tenantId,
        userId: member.userId,
        kind: "review_waiting",
        payload: { submissionIds: [submissionId] },
        sendAfter,
      })
      .onConflictDoUpdate({
        target: [notifications.tenantId, notifications.userId],
        targetWhere: REVIEW_WAITING_PENDING,
        set: {
          payload: sql`case
            when ("notifications"."payload" -> 'submissionIds') @> (excluded."payload" -> 'submissionIds')
              then "notifications"."payload"
            else jsonb_set("notifications"."payload", '{submissionIds}',
              ("notifications"."payload" -> 'submissionIds') || (excluded."payload" -> 'submissionIds'))
          end`,
        },
      });
    queued++;
  }
  return queued;
}

export interface WaitingHandIn {
  submissionId: string;
  kind: QueueKind;
  alias: string;
  courseTitle: LocalizedText;
}

/**
 * Of the given hand-ins, those that still wait for this person when the mail
 * goes out, oldest first; null when they no longer review at all.
 */
export async function stillWaitingFor(
  tx: Transaction,
  tenantId: string,
  userId: string,
  submissionIds: readonly string[],
): Promise<WaitingHandIn[] | null> {
  const scope = reviewAlertScope(await rolesOf(tx, userId));
  if (!scope) return null;
  if (submissionIds.length === 0) return [];
  const rows = await tx
    .select({
      submissionId: submissions.id,
      learnerId: submissions.userId,
      status: submissions.status,
      courseTitle: courses.title,
      hasHuman: sql<boolean>`exists (select 1 from ${reviews} r where r.submission_id = "submissions"."id" and r.reviewer_type = 'human')`,
      aiRouting: sql<ReviewRoutingRecord | null>`(select r.routing from ${reviews} r where r.submission_id = "submissions"."id" and r.reviewer_type = 'ai' order by r.created_at desc limit 1)`,
    })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .innerJoin(courses, eq(courses.id, assignments.courseId))
    .where(
      and(
        inArray(submissions.id, [...submissionIds]),
        scope === "cohorts" ? mentorScope(userId) : undefined,
      ),
    )
    .orderBy(asc(submissions.submittedAt));
  return rows.flatMap((row) => {
    const kind = reviewQueueKind({
      status: row.status,
      hasHumanReview: row.hasHuman,
      aiRouting: row.aiRouting,
    });
    if (!kind || row.learnerId === userId) return [];
    return [
      {
        submissionId: row.submissionId,
        kind,
        alias: learnerAlias(tenantId, row.learnerId),
        courseTitle: row.courseTitle,
      },
    ];
  });
}
