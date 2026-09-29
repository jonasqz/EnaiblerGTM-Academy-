import { and, eq, inArray, isNull } from "drizzle-orm";

import type { EntryContext } from "@/core/entry/context";
import { localize, type Locale, type LocalizedText } from "@/core/i18n/locales";
import { tenantTranslator } from "@/core/i18n/tenant-translator";
import type { TenantContext } from "@/core/tenant/context";
import { givenConsents } from "@/core/webinars/registration";
import { sessionsToRegister } from "@/core/webinars/series";
import type { Database, Transaction } from "@/db/client";
import { courses, enrollments, webinarRegistrations } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { completeWaitingLearners } from "@/server/courses/completion";
import { planHomeworkReminders } from "@/server/courses/deadline";
import { queueCourseMail } from "@/server/courses/mail";
import { courseSessions, markSessionLessons, type CourseSession } from "@/server/courses/sessions";
import { ensureEnrollment } from "@/server/learners";
import type { SessionsChanged } from "@/server/studio/lessons";
import { seatLearner, type AfterSeat } from "@/server/webinars/registration";

/*
 * A webinar series as one course (webinar brief §2.7): enrolling is one
 * registration for every session. Each session keeps its own seat, waitlist
 * and reminders (server/webinars/registration); the learner gets one
 * confirmation listing all of them with one calendar file (server/courses/mail).
 * Registering on a session's own page enrolls in the whole series, and a
 * session added to a live course later registers its learners, with a mail.
 *
 * Cancelling one session (on its page or from its mails) cancels that
 * session only: the learner stays on the course, its page offers the seat
 * again, and a later sync respects the cancellation. There is no leaving a
 * course: deleting one's data in "My learning" ends every registration.
 */

type CourseRow = typeof courses.$inferSelect;

/** The course a webinar is a session of, when that course is published. */
async function publishedSeriesOf(
  tx: Transaction,
  webinar: { id: string; courseId: string | null },
): Promise<{ course: CourseRow; sessions: CourseSession[] } | null> {
  if (!webinar.courseId) return null;
  const [course] = await tx.select().from(courses).where(eq(courses.id, webinar.courseId));
  if (!course || course.status !== "published") return null;
  const sessions = await courseSessions(tx, course.id);
  return sessions.some((session) => session.webinar.id === webinar.id)
    ? { course, sessions }
    : null;
}

/**
 * Registers an enrolled learner for the course's sessions (or only
 * `webinarIds`), each with a seat or on its waitlist, and queues one mail
 * about all of them. Returns the registrations the mail announces.
 */
export async function registerForSessions(
  tx: Transaction,
  tenant: TenantContext,
  input: {
    userId: string;
    courseId: string;
    reason: "enrolled" | "added";
    now: Date;
    webinarIds?: readonly string[];
    /** A seat taken already in this transaction (on the session's own page). */
    seated?: readonly string[];
  },
): Promise<string[]> {
  const [row] = await tx
    .select({ course: courses, enrollment: enrollments })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(and(eq(enrollments.courseId, input.courseId), eq(enrollments.userId, input.userId)));
  if (!row || row.course.status !== "published") return [];
  const { course, enrollment } = row;
  const sessions = (await courseSessions(tx, course.id)).filter(
    (session) => !input.webinarIds || input.webinarIds.includes(session.webinar.id),
  );
  if (sessions.length === 0) return [...(input.seated ?? [])];
  const mine = await tx
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
    );
  const wanted = sessionsToRegister(
    sessions.map((session) => ({
      webinarId: session.webinar.id,
      status: session.webinar.status,
      startsAt: session.webinar.startsAt,
      durationMinutes: session.webinar.durationMinutes,
      registration:
        mine.find((registration) => registration.webinarId === session.webinar.id)?.status ?? null,
    })),
    input.reason,
    input.now,
  );

  const t = tenantTranslator(tenant, enrollment.locale);
  const academy = tenant.settings.author_display_name;
  const courseTitle = localize(course.title, t.locale, [tenant.settings.default_locale]);
  const announced = new Set(input.seated ?? []);
  let seatedNow = 0;
  for (const session of sessions) {
    if (!wanted.includes(session.webinar.id)) continue;
    const { webinar } = session;
    // Enrolling is what the learner agreed to: the course and, with it, its sessions.
    const consents = givenConsents(
      {
        participation: t.t("series.participation", {
          course: courseTitle,
          title: webinar.title,
          academy,
        }),
        recording: webinar.recorded
          ? (webinar.recordingNotice ?? t.t("webinar.form.recording", { academy }))
          : null,
      },
      input.now,
    );
    const seat = await seatLearner(tx, tenant, webinar.id, {
      userId: input.userId,
      consents,
      entry: enrollment.entryContext,
      locale: enrollment.locale,
      now: input.now,
      confirmationMail: false,
    });
    if (!seat) continue;
    announced.add(seat.registrationId);
    if (!seat.already) seatedNow += 1;
  }
  // On enrolling, the confirmation lists every date they have, whenever they registered.
  if (input.reason === "enrolled") {
    for (const registration of mine) {
      if (registration.status === "registered" || registration.status === "waitlist") {
        announced.add(registration.id);
      }
    }
  }
  if (seatedNow === 0 && (input.seated ?? []).length === 0) return [...announced];
  await queueCourseMail(tx, tenant.id, {
    userId: input.userId,
    courseId: course.id,
    step: input.reason === "enrolled" ? "series_enrolled" : "session_added",
    registrationIds: [...announced],
  });
  return [...announced];
}

/**
 * What starting a course brings along, in its transaction: a seat in every
 * session of a series, the homework reminder when there is a deadline, and
 * session lessons they took part in before (a webinar they came from).
 */
async function afterEnrollment(
  tx: Transaction,
  tenant: TenantContext,
  input: { userId: string; courseId: string; now: Date; seated?: readonly string[] },
): Promise<void> {
  await registerForSessions(tx, tenant, { ...input, reason: "enrolled" });
  await planHomeworkReminders(tx, tenant.id, {
    courseId: input.courseId,
    userIds: [input.userId],
    now: input.now,
  });
  await markSessionLessons(tx, tenant.id, { userId: input.userId, courseId: input.courseId });
}

/**
 * Enrolls the learner in a published course (server/learners) and, the
 * first time, registers them for its sessions. Every way into a course goes
 * through here: the start link, a cohort invitation, a session's page.
 */
export async function enrollLearner(
  tx: Transaction,
  tenant: TenantContext,
  userId: string,
  options: { courseSlug: string; locale: Locale; entry: EntryContext; now?: Date },
): Promise<{ enrollmentId: string; created: boolean } | null> {
  const enrolled = await ensureEnrollment(tx, tenant, userId, options);
  if (enrolled?.created) {
    const [course] = await tx
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.slug, options.courseSlug));
    if (course) {
      await afterEnrollment(tx, tenant, {
        userId,
        courseId: course.id,
        now: options.now ?? new Date(),
      });
    }
  }
  return enrolled;
}

/**
 * For registrations on a session's own page (and its embed): the seat just
 * taken enrolls the learner in the series, with every other session, and the
 * series' one confirmation replaces the session's own. Someone already on
 * the course just gets this session back, with its own confirmation.
 */
export function joinSeriesAfterSeat(tenant: TenantContext, now: Date = new Date()): AfterSeat {
  return async (tx, seat) => {
    const series = await publishedSeriesOf(tx, seat.webinar);
    if (!series) return { mailed: false };
    const enrolled = await ensureEnrollment(tx, tenant, seat.userId, {
      courseSlug: series.course.slug,
      locale: seat.locale as Locale,
      entry: { ...seat.entry, course: series.course.slug },
    });
    if (!enrolled?.created) return { mailed: false };
    await afterEnrollment(tx, tenant, {
      userId: seat.userId,
      courseId: series.course.id,
      now,
      seated: [seat.registrationId],
    });
    return { mailed: true };
  };
}

/**
 * Sessions that came to a published course later (a lesson became a session,
 * a session was published, the course went live again): its learners who
 * have not finished are registered, each hearing about it in one mail.
 */
export async function registerLearnersForSessions(
  tx: Transaction,
  tenant: TenantContext,
  input: { courseId: string; webinarIds?: readonly string[]; now: Date },
): Promise<number> {
  const [course] = await tx
    .select({ status: courses.status })
    .from(courses)
    .where(eq(courses.id, input.courseId));
  if (course?.status !== "published") return 0;
  const learners = await tx
    .select({ userId: enrollments.userId })
    .from(enrollments)
    .where(and(eq(enrollments.courseId, input.courseId), isNull(enrollments.completedAt)));
  let registered = 0;
  for (const { userId } of learners) {
    const announced = await registerForSessions(tx, tenant, {
      userId,
      courseId: input.courseId,
      reason: "added",
      now: input.now,
      webinarIds: input.webinarIds,
    });
    if (announced.length > 0) registered += 1;
  }
  return registered;
}

/**
 * For the Studio's lesson saves: a lesson that became a session registers
 * the course's learners, one that stopped being a session may finish those
 * who had done everything else.
 */
export function sessionsChangedFor(tenant: TenantContext): SessionsChanged {
  return async (tx, change) => {
    const now = new Date();
    if (change.added) {
      await registerLearnersForSessions(tx, tenant, {
        courseId: change.courseId,
        webinarIds: [change.added],
        now,
      });
    }
    if (change.removed) await completeWaitingLearners(tx, tenant, change.courseId, now);
  };
}

/** A published webinar that is a session of a published course registers that course's learners. */
export async function registerLearnersForWebinar(
  tx: Transaction,
  tenant: TenantContext,
  webinar: { id: string; courseId: string | null },
  now: Date,
): Promise<number> {
  const series = await publishedSeriesOf(tx, webinar);
  if (!series) return 0;
  return registerLearnersForSessions(tx, tenant, {
    courseId: series.course.id,
    webinarIds: [webinar.id],
    now,
  });
}

/**
 * An enrolled learner takes a session's seat again from the course (after
 * cancelling it, or when it came before they did): the session's own
 * confirmation, as on its page.
 */
export async function registerForSession(
  db: Database,
  tenant: TenantContext,
  input: { userId: string; courseSlug: string; webinarId: string; now?: Date },
): Promise<"registered" | "waitlist" | "closed" | "not_enrolled"> {
  const now = input.now ?? new Date();
  return withTenant(db, tenant.id, async (tx) => {
    const [row] = await tx
      .select({ course: courses, enrollment: enrollments })
      .from(enrollments)
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .where(and(eq(courses.slug, input.courseSlug), eq(enrollments.userId, input.userId)));
    if (!row || row.course.status !== "published") return "not_enrolled";
    const sessions = await courseSessions(tx, row.course.id);
    const session = sessions.find((candidate) => candidate.webinar.id === input.webinarId);
    if (!session) return "closed";
    const t = tenantTranslator(tenant, row.enrollment.locale);
    const academy = tenant.settings.author_display_name;
    const seat = await seatLearner(tx, tenant, session.webinar.id, {
      userId: input.userId,
      consents: givenConsents(
        {
          participation: t.t("series.participation", {
            course: localize(row.course.title, t.locale, [tenant.settings.default_locale]),
            title: session.webinar.title,
            academy,
          }),
          recording: session.webinar.recorded
            ? (session.webinar.recordingNotice ?? t.t("webinar.form.recording", { academy }))
            : null,
        },
        now,
      ),
      entry: row.enrollment.entryContext,
      locale: row.enrollment.locale,
      now,
      confirmationMail: true,
    });
    return seat ? seat.status : "closed";
  });
}

export interface SeriesOverview {
  course: { slug: string; title: LocalizedText };
  sessions: Array<{
    webinarId: string;
    slug: string;
    title: string;
    locale: string;
    startsAt: Date;
    durationMinutes: number;
    timeZone: string;
    status: "draft" | "published" | "cancelled";
  }>;
  /** Whether the viewer is on the course already. */
  enrolled: boolean;
}

/** For a session's page: the series it belongs to, when that course is published. */
export async function seriesOverview(
  db: Database,
  tenantId: string,
  webinar: { id: string; courseId: string | null },
  userId: string | null,
): Promise<SeriesOverview | null> {
  return withTenant(db, tenantId, async (tx) => {
    const series = await publishedSeriesOf(tx, webinar);
    if (!series) return null;
    const [enrollment] = userId
      ? await tx
          .select({ id: enrollments.id })
          .from(enrollments)
          .where(and(eq(enrollments.courseId, series.course.id), eq(enrollments.userId, userId)))
      : [];
    return {
      course: { slug: series.course.slug, title: series.course.title },
      sessions: series.sessions
        .filter((session) => session.webinar.status !== "draft")
        .map(({ webinar }) => ({
          webinarId: webinar.id,
          slug: webinar.slug,
          title: webinar.title,
          locale: webinar.locale,
          startsAt: webinar.startsAt,
          durationMinutes: webinar.durationMinutes,
          timeZone: webinar.timeZone,
          status: webinar.status,
        })),
      enrolled: enrollment !== undefined,
    };
  });
}
