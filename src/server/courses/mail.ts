import { and, eq, inArray } from "drizzle-orm";

import { formatDeadline, homeworkReminderDue } from "@/core/assignments/deadline";
import { requiresWork } from "@/core/courses/completion";
import { localize } from "@/core/i18n/locales";
import { tenantTranslator } from "@/core/i18n/tenant-translator";
import type { TenantContext } from "@/core/tenant/context";
import { buildIcs } from "@/core/webinars/ics";
import { JOIN_OPENS_MINUTES, webinarPhase } from "@/core/webinars/phase";
import { seriesEvents } from "@/core/webinars/series";
import { formatWebinarTime } from "@/core/webinars/time";
import type { Transaction } from "@/db/client";
import {
  assignments,
  courses,
  enrollments,
  notifications,
  submissions,
  webinarRegistrations,
  webinars,
  type CourseMailPayload,
  type CourseMailStep,
} from "@/db/schema";
import { senderFor, type OutgoingEmail } from "@/server/email/mailer";
import { renderNoticeEmail } from "@/server/email/templates/notice";
import { academyUrl } from "@/server/platform/config";
import { appTimeZone } from "@/server/time-zone";
import { webinarUrl } from "@/server/webinars/links";

/*
 * Mail about a learner's course (outbox kind `course`): the one confirmation
 * of a series with every session and a calendar file holding all of them, a
 * session added later, and the homework reminder before the deadline.
 * Queued in the transaction of what it reports, written when it goes out,
 * in the learner's course language; one that is no longer true stays unsent.
 */

export async function queueCourseMail(
  tx: Transaction,
  tenantId: string,
  input: {
    userId: string;
    courseId: string;
    step: CourseMailStep;
    registrationIds?: readonly string[];
    plannedFor?: Date;
    sendAfter?: Date;
  },
): Promise<void> {
  const payload: CourseMailPayload = {
    courseId: input.courseId,
    step: input.step,
    ...(input.registrationIds ? { registrationIds: [...input.registrationIds] } : {}),
    ...(input.plannedFor ? { plannedFor: input.plannedFor.toISOString() } : {}),
  };
  await tx.insert(notifications).values({
    tenantId,
    userId: input.userId,
    kind: "course",
    payload,
    sendAfter: input.sendAfter ?? new Date(),
  });
}

function outgoing(
  tenant: TenantContext,
  to: string,
  rendered: { subject: string; html: string; text: string },
  calendar?: OutgoingEmail["calendar"],
): OutgoingEmail {
  const from = senderFor(tenant);
  return {
    to,
    from: { name: from.name, address: from.address },
    replyTo: from.replyTo,
    ...rendered,
    headers: { "Auto-Submitted": "auto-generated" },
    ...(calendar ? { calendar } : {}),
  };
}

type Prepared = { mail: OutgoingEmail } | { skip: string };

async function seriesMail(
  tx: Transaction,
  tenant: TenantContext,
  to: string,
  userId: string,
  payload: CourseMailPayload,
  course: typeof courses.$inferSelect,
  locale: string,
): Promise<Prepared> {
  const ids = payload.registrationIds ?? [];
  const rows = ids.length
    ? await tx
        .select({ registration: webinarRegistrations, webinar: webinars })
        .from(webinarRegistrations)
        .innerJoin(webinars, eq(webinars.id, webinarRegistrations.webinarId))
        .where(inArray(webinarRegistrations.id, ids))
    : [];
  const now = new Date();
  // Only what is still true: a seat or a waitlist place of theirs, for a session still ahead.
  const sessions = rows
    .filter(
      ({ registration, webinar }) =>
        registration.userId === userId &&
        (registration.status === "registered" || registration.status === "waitlist") &&
        webinar.status === "published" &&
        webinarPhase(webinar, now) !== "ended",
    )
    .sort((a, b) => a.webinar.startsAt.getTime() - b.webinar.startsAt.getTime());
  if (sessions.length === 0) return { skip: "superseded" };

  const t = tenantTranslator(tenant, locale);
  const academy = tenant.settings.author_display_name;
  const title = localize(course.title, t.locale, [tenant.settings.default_locale]);
  const seated = sessions.filter(({ registration }) => registration.status === "registered");
  const added = payload.step === "session_added";
  const rendered = await renderNoticeEmail({
    tenant,
    t,
    subject: t.t(added ? "email.series.added.subject" : "email.series.enrolled.subject", {
      course: title,
    }),
    heading: t.t(added ? "email.series.added.heading" : "email.series.enrolled.heading"),
    paragraphs: [
      t.t(added ? "email.series.added.body" : "email.series.enrolled.body", {
        course: title,
        academy,
      }),
      ...(seated.length < sessions.length ? [t.t("email.series.waitlistNote")] : []),
    ],
    list: sessions.map(({ registration, webinar }) =>
      t.t(
        registration.status === "waitlist"
          ? "email.series.sessionWaitlist"
          : "email.series.session",
        {
          title: webinar.title,
          time: formatWebinarTime(
            webinar.startsAt,
            webinar.durationMinutes,
            webinar.timeZone,
            t.locale,
          ),
        },
      ),
    ),
    button: {
      label: t.t("email.series.button"),
      url: academyUrl(tenant, `/courses/${course.slug}`),
    },
    note: t.t("email.series.note", { minutes: JOIN_OPENS_MINUTES }),
    reason: t.t("email.series.reason", { academy }),
  });
  if (seated.length === 0) return { mail: outgoing(tenant, to, rendered) };
  const sender = senderFor(tenant);
  const content = buildIcs({
    method: "REQUEST",
    organizer: { name: sender.name, email: sender.address },
    attendee: to,
    now,
    events: seriesEvents(
      seated.map(({ webinar }) => ({ ...webinar, url: webinarUrl(tenant, webinar.slug) })),
      {
        domain: tenant.primaryDomain,
        note: t.t("email.webinar.calendarNote", { minutes: JOIN_OPENS_MINUTES }),
      },
    ),
  });
  return { mail: outgoing(tenant, to, rendered, { method: "REQUEST", content }) };
}

async function homeworkMail(
  tx: Transaction,
  tenant: TenantContext,
  to: string,
  userId: string,
  payload: CourseMailPayload,
  course: typeof courses.$inferSelect,
  enrollment: { locale: string; completedAt: Date | null } | undefined,
): Promise<Prepared> {
  const [assignment] = await tx
    .select()
    .from(assignments)
    .where(eq(assignments.courseId, course.id));
  const [handedIn] = assignment
    ? await tx
        .select({ id: submissions.id })
        .from(submissions)
        .where(and(eq(submissions.assignmentId, assignment.id), eq(submissions.userId, userId)))
        .limit(1)
    : [];
  const due = homeworkReminderDue({
    plannedFor: payload.plannedFor ?? "",
    dueAt: assignment?.dueAt ?? null,
    enrolled: enrollment !== undefined,
    completed: Boolean(enrollment?.completedAt),
    handedIn: handedIn !== undefined,
    asksForWork: course.status === "published" && requiresWork(course.completionMode),
  });
  if (due !== "send" || !assignment?.dueAt) return { skip: due };

  const t = tenantTranslator(tenant, enrollment?.locale);
  const fallback = [tenant.settings.default_locale];
  const academy = tenant.settings.author_display_name;
  const artifact = localize(assignment.artifactName, t.locale, fallback);
  const refused = tenant.settings.assignments.late_submissions === "refused";
  const rendered = await renderNoticeEmail({
    tenant,
    t,
    subject: t.t("email.homework.subject", { artifact }),
    heading: t.t("email.homework.heading"),
    paragraphs: [
      t.t("email.homework.body", {
        artifact,
        course: localize(course.title, t.locale, fallback),
        deadline: formatDeadline(assignment.dueAt, appTimeZone(), t.locale),
      }),
      t.t(refused ? "email.homework.lateRefused" : "email.homework.lateAccepted"),
    ],
    button: {
      label: t.t("email.homework.button"),
      url: academyUrl(tenant, `/courses/${course.slug}/assignment`),
    },
    reason: t.t("email.homework.reason", { academy }),
  });
  return { mail: outgoing(tenant, to, rendered) };
}

/** Writes one queued course mail, or says why it stays unsent. */
export async function courseMail(
  tx: Transaction,
  tenant: TenantContext,
  to: string,
  userId: string,
  payload: CourseMailPayload,
): Promise<Prepared> {
  const [course] = await tx.select().from(courses).where(eq(courses.id, payload.courseId));
  if (!course) return { skip: "gone" };
  const [enrollment] = await tx
    .select({ locale: enrollments.locale, completedAt: enrollments.completedAt })
    .from(enrollments)
    .where(and(eq(enrollments.courseId, course.id), eq(enrollments.userId, userId)));
  switch (payload.step) {
    case "series_enrolled":
    case "session_added":
      return seriesMail(
        tx,
        tenant,
        to,
        userId,
        payload,
        course,
        enrollment?.locale ?? tenant.settings.default_locale,
      );
    case "homework_due":
      return homeworkMail(tx, tenant, to, userId, payload, course, enrollment);
  }
}
