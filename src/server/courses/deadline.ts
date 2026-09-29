import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { homeworkReminderAt } from "@/core/assignments/deadline";
import type { Transaction } from "@/db/client";
import { assignments, enrollments, notifications, submissions } from "@/db/schema";
import { queueCourseMail } from "@/server/courses/mail";

/*
 * The homework reminder (webinar brief §3): two days before the deadline, to
 * learners on the course who have not handed in yet. Planned in the outbox
 * when the deadline is set and when someone enrolls; a moved deadline skips
 * the old reminders and plans new ones. Whether it still goes is decided when
 * it is due (core/assignments/deadline, homeworkReminderDue).
 */

/** Plans the reminder for the course's learners (or only `userIds`) who still owe the work. */
export async function planHomeworkReminders(
  tx: Transaction,
  tenantId: string,
  input: { courseId: string; userIds?: readonly string[]; now: Date },
): Promise<number> {
  const [assignment] = await tx
    .select({ id: assignments.id, dueAt: assignments.dueAt })
    .from(assignments)
    .where(eq(assignments.courseId, input.courseId));
  const sendAt = homeworkReminderAt(assignment?.dueAt ?? null, input.now);
  if (!assignment?.dueAt || !sendAt) return 0;
  if (input.userIds && input.userIds.length === 0) return 0;
  const learners = await tx
    .select({ userId: enrollments.userId })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.courseId, input.courseId),
        isNull(enrollments.completedAt),
        input.userIds ? inArray(enrollments.userId, [...input.userIds]) : undefined,
        sql`not exists (select 1 from ${submissions} s where s.assignment_id = ${assignment.id} and s.user_id = ${enrollments.userId})`,
      ),
    );
  for (const { userId } of learners) {
    await queueCourseMail(tx, tenantId, {
      userId,
      courseId: input.courseId,
      step: "homework_due",
      plannedFor: assignment.dueAt,
      sendAfter: sendAt,
    });
  }
  return learners.length;
}

/** The deadline moved (or went): reminders planned for the old one stay unsent. */
export async function replanHomeworkReminders(
  tx: Transaction,
  tenantId: string,
  courseId: string,
  now: Date,
): Promise<number> {
  await tx
    .update(notifications)
    .set({ status: "skipped", note: "rescheduled", processedAt: now })
    .where(
      and(
        eq(notifications.kind, "course"),
        eq(notifications.status, "pending"),
        sql`${notifications.payload}->>'step' = 'homework_due'`,
        sql`${notifications.payload}->>'courseId' = ${courseId}`,
      ),
    );
  return planHomeworkReminders(tx, tenantId, { courseId, now });
}
