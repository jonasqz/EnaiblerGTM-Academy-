import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SessionRule } from "@/core/courses/sessions";
import { tenantTranslator } from "@/core/i18n/tenant-translator";
import type { TenantContext } from "@/core/tenant/context";
import type { WebinarSetup } from "@/core/webinars/setup";
import {
  assignments,
  courses,
  credentials,
  enrollments,
  lessons,
  mediaAssets,
  notifications,
  submissions,
  user,
  webinarRegistrations,
  webinars,
  type CourseMailPayload,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import { completeCourse } from "@/server/courses/completion";
import { loadCredential } from "@/server/credentials";
import { loadLandingCourse } from "@/server/credentials/landing";
import { openBadgeFor } from "@/server/credentials/open-badge";
import type { OutgoingEmail } from "@/server/email/mailer";
import type { Enqueue } from "@/server/jobs/producer";
import { ensureLearner } from "@/server/learners";
import { loadLearnerCourse, submitAssignment } from "@/server/learning";
import { recordProgress } from "@/server/media/progress";
import { signedUpIn } from "@/server/media/viewer";
import { dispatchNotifications } from "@/server/notifications";
import { exportMyData } from "@/server/profile";
import { recordDecision } from "@/server/review/process-submission";
import {
  createCourse,
  loadCourseEditor,
  publishCourse,
  updateCourseSettings,
  updateOutcome,
} from "@/server/studio/courses";
import { createLesson, updateLesson } from "@/server/studio/lessons";
import { courseSessionNumbers } from "@/server/studio/sessions";
import {
  cancelRegistration,
  checkIn,
  registerSignedIn,
  type RegistrationRequest,
} from "@/server/webinars/registration";
import {
  enrollLearner,
  registerLearnersForSessions,
  sessionsChangedFor,
} from "@/server/webinars/series";
import {
  cancelWebinar,
  createWebinar,
  publishWebinar,
  setAttendance,
  updateWebinarSetup,
} from "@/server/webinars/studio";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

describe.skipIf(!hasDatabase)("webinar series as courses", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let author: string;
  const sent: OutgoingEmail[] = [];
  const send = async (mail: OutgoingEmail) => {
    sent.push(mail);
  };
  const noJobs: Enqueue = async () => {};

  beforeAll(async () => {
    process.env.DATA_ENCRYPTION_SECRET ??= "test-data-encryption-secret-0123456789";
    dbs = await openTestDatabases();
    tenant = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    author = await createUser(dbs.owner.db);
  });

  afterAll(async () => {
    await dbs?.close();
  });

  const inTenant = <T>(work: Parameters<typeof withTenant<T>>[2]) =>
    withTenant(dbs.app.db, tenant.id, work);

  async function emailOf(userId: string): Promise<string> {
    const [row] = await dbs.owner.db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, userId));
    return row!.email;
  }

  /** A published webinar of the course, `hours` from now. */
  async function webinar(courseId: string, hours: number, capacity: number | null = null) {
    const id = await createWebinar(dbs.app.db, tenant.id, {
      title: `Session at ${hours} h`,
      locale: "en",
      startsAt: new Date(Date.now() + hours * HOUR),
      timeZone: "Europe/Berlin",
      durationMinutes: 60,
      createdBy: author,
    });
    const [row] = await inTenant((tx) => tx.select().from(webinars).where(eq(webinars.id, id)));
    const setup: WebinarSetup = {
      slug: row!.slug,
      locale: "en",
      title: row!.title,
      description: "Live, together.",
      startsAt: row!.startsAt,
      timeZone: "Europe/Berlin",
      durationMinutes: 60,
      capacity,
      joinUrl: "https://meet.example.com/abc-defg-hij",
      courseId,
      recorded: true,
      recordingNotice: null,
    };
    expect((await updateWebinarSetup(dbs.app.db, tenant, id, setup)).ok).toBe(true);
    return id;
  }

  /** A course with work and a session lesson per webinar, published with the rule. */
  async function series(options: {
    rule: SessionRule;
    catchUpDays?: number | null;
    sessions: Array<{ hours: number; capacity?: number | null; draft?: boolean }>;
  }) {
    const courseId = await createCourse(dbs.app.db, tenant.id, {
      languages: ["en"],
      title: `Pricing live ${Math.random().toString(36).slice(2, 8)}`,
      artifactName: "Pricing page",
      outcome: "Build the pricing page you will put live.",
      deliveryMode: "free_async",
    });
    const sessionIds: string[] = [];
    const lessonKeys: string[] = [];
    for (const [index, session] of options.sessions.entries()) {
      const webinarId = await webinar(courseId, session.hours, session.capacity ?? null);
      if (!session.draft)
        expect(await publishWebinar(dbs.app.db, tenant, webinarId)).toEqual({ ok: true });
      const lessonId = await createLesson(dbs.app.db, tenant.id, courseId, {
        locale: "en",
        title: `Session ${index + 1}`,
        userId: author,
      });
      const saved = await updateLesson(dbs.app.db, tenant.id, lessonId, {
        title: `Session ${index + 1}`,
        markdown: "Bring your current pricing page.",
        criterionIds: [],
        webinarId,
        userId: author,
      });
      expect(saved.changed).toBe(true);
      const [lesson] = await inTenant((tx) =>
        tx.select({ key: lessons.key }).from(lessons).where(eq(lessons.id, lessonId)),
      );
      sessionIds.push(webinarId);
      lessonKeys.push(lesson!.key);
    }
    await inTenant((tx) =>
      tx
        .update(courses)
        .set({
          status: "published",
          publishedAt: new Date(),
          sessionRule: options.rule,
          catchUpDays: options.catchUpDays ?? null,
        })
        .where(eq(courses.id, courseId)),
    );
    const [course] = await inTenant((tx) =>
      tx.select({ slug: courses.slug }).from(courses).where(eq(courses.id, courseId)),
    );
    return { courseId, slug: course!.slug, sessionIds, lessonKeys };
  }

  async function enroll(slug: string, userId?: string) {
    const id = userId ?? (await createUser(dbs.owner.db));
    await inTenant(async (tx) => {
      await ensureLearner(tx, tenant, id, { locale: "en", entry: {} });
      await enrollLearner(tx, tenant, id, { courseSlug: slug, locale: "en", entry: {} });
    });
    return id;
  }

  /** Moves a session so it started `hours` ago (negative: in the past). */
  const moveTo = (webinarId: string, hoursFromNow: number) =>
    inTenant((tx) =>
      tx
        .update(webinars)
        .set({ startsAt: new Date(Date.now() + hoursFromNow * HOUR) })
        .where(eq(webinars.id, webinarId)),
    );

  const registrationOf = async (webinarId: string, userId: string) =>
    (
      await inTenant((tx) =>
        tx
          .select()
          .from(webinarRegistrations)
          .where(
            and(
              eq(webinarRegistrations.webinarId, webinarId),
              eq(webinarRegistrations.userId, userId),
            ),
          ),
      )
    )[0];

  const mailsOf = (userId: string) =>
    inTenant((tx) => tx.select().from(notifications).where(eq(notifications.userId, userId)));

  const credentialOf = async (userId: string, courseId: string) =>
    (
      await inTenant((tx) =>
        tx
          .select()
          .from(credentials)
          .where(and(eq(credentials.userId, userId), eq(credentials.courseId, courseId))),
      )
    )[0];

  const enrollmentOf = async (userId: string, courseId: string) =>
    (
      await inTenant((tx) =>
        tx
          .select()
          .from(enrollments)
          .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))),
      )
    )[0];

  /** A released pass of the learner's work, as the review job records it. */
  async function passWork(userId: string, courseId: string) {
    const editor = await loadCourseEditor(dbs.app.db, tenant.id, courseId);
    return inTenant(async (tx) => {
      const [submission] = await tx
        .insert(submissions)
        .values({
          tenantId: tenant.id,
          assignmentId: editor!.assignment!.id,
          userId,
          attemptNo: 1,
          status: "passed",
          extractedText: "Starter, Pro, Team.",
          decidedAt: new Date(),
        })
        .returning({ id: submissions.id });
      await recordDecision(tx, tenant, {
        userId,
        courseId,
        submissionId: submission!.id,
        pass: true,
        locale: "en",
      });
      return submission!.id;
    });
  }

  /** A ready video of ten minutes, shown as the session's recording. */
  async function recordingFor(webinarId: string) {
    const [asset] = await inTenant((tx) =>
      tx
        .insert(mediaAssets)
        .values({
          tenantId: tenant.id,
          kind: "upload",
          status: "ready",
          title: "Session recording",
          access: "learners",
          durationSec: 600,
          hlsRun: "r1",
        })
        .returning({ id: mediaAssets.id }),
    );
    await inTenant((tx) =>
      tx.update(webinars).set({ recordingAssetId: asset!.id }).where(eq(webinars.id, webinarId)),
    );
    return asset!.id;
  }

  const watch = (userId: string, assetId: string, now: Date) =>
    recordProgress(
      dbs.app.db,
      tenant,
      { userId, member: true, canEditCourses: false },
      { asset: assetId, ranges: [[0, 600]] },
      now,
    );

  it("registers an enrolling learner for every session: a seat, or the waitlist when full", async () => {
    const { slug, sessionIds } = await series({
      rule: "attended",
      sessions: [{ hours: 48 }, { hours: 96, capacity: 1 }],
    });
    const [first, full] = sessionIds as [string, string];
    // Someone takes the only seat of the second session on its own page.
    const early = await createUser(dbs.owner.db);
    const request: RegistrationRequest = {
      answers: { name: "Grace" },
      marketing: false,
      leadHandoff: false,
      locale: "en",
      entry: {},
    };
    const [fullRow] = await inTenant((tx) =>
      tx.select({ slug: webinars.slug }).from(webinars).where(eq(webinars.id, full)),
    );
    expect(
      await registerSignedIn(dbs.app.db, tenant, {
        slug: fullRow!.slug,
        userId: early,
        email: await emailOf(early),
        request,
        t: tenantTranslator(tenant, "en"),
      }),
    ).toMatchObject({ ok: true, status: "registered" });

    const learner = await enroll(slug);
    expect((await registrationOf(first, learner))?.status).toBe("registered");
    expect((await registrationOf(full, learner))?.status).toBe("waitlist");

    // One confirmation for the series instead of one per session; reminders per seat as usual.
    const mails = await mailsOf(learner);
    const courseMails = mails.filter((mail) => mail.kind === "course");
    expect(courseMails).toHaveLength(1);
    expect(courseMails[0]!.payload).toMatchObject({ step: "series_enrolled" });
    expect((courseMails[0]!.payload as CourseMailPayload).registrationIds).toHaveLength(2);
    const steps = mails
      .filter((mail) => mail.kind === "webinar")
      .map(
        (mail) =>
          `${(mail.payload as { webinarId: string }).webinarId}:${(mail.payload as { step: string }).step}`,
      );
    expect(steps).not.toContain(`${first}:confirmation`);
    expect(steps).not.toContain(`${full}:waitlist`);
    expect(steps).toContain(`${first}:reminder_24h`);

    // The confirmation lists both dates; the calendar file holds the seat only.
    await dispatchNotifications(dbs.app.db, tenant, { send });
    const address = await emailOf(learner);
    const mail = sent.find((candidate) => candidate.to === address);
    expect(mail?.subject).toMatch(/^Your live sessions in /);
    expect(mail?.text).toContain("(waitlist)");
    expect(mail?.calendar?.method).toBe("REQUEST");
    const ics = mail!.calendar!.content.replace(/\r\n /g, "");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain(`UID:webinar-${first}@`);
    expect(ics).not.toContain(`UID:webinar-${full}@`);
  });

  it("enrolls in the whole series from a session's own page", async () => {
    const { courseId, sessionIds } = await series({
      rule: "attended_or_watched",
      catchUpDays: 7,
      sessions: [{ hours: 30 }, { hours: 60 }],
    });
    const [first, second] = sessionIds as [string, string];
    const [page] = await inTenant((tx) =>
      tx.select({ slug: webinars.slug }).from(webinars).where(eq(webinars.id, first)),
    );
    const learner = await createUser(dbs.owner.db);
    const { joinSeriesAfterSeat } = await import("@/server/webinars/series");
    const result = await registerSignedIn(
      dbs.app.db,
      tenant,
      {
        slug: page!.slug,
        userId: learner,
        email: await emailOf(learner),
        request: {
          answers: { name: "Ada" },
          marketing: false,
          leadHandoff: false,
          locale: "en",
          entry: { utm: { source: "linkedin" } },
        },
        t: tenantTranslator(tenant, "en"),
      },
      { afterSeat: joinSeriesAfterSeat(tenant) },
    );
    expect(result).toMatchObject({ ok: true, status: "registered" });
    const enrollment = await enrollmentOf(learner, courseId);
    expect(enrollment?.entryContext).toMatchObject({ utm: { source: "linkedin" } });
    expect((await registrationOf(second, learner))?.status).toBe("registered");
    const mails = await mailsOf(learner);
    expect(mails.filter((mail) => mail.kind === "course")).toHaveLength(1);
    expect(
      mails.some(
        (mail) =>
          mail.kind === "webinar" && (mail.payload as { step: string }).step === "confirmation",
      ),
    ).toBe(false);
    // What they agreed to on the page stays with that session's registration.
    expect((await registrationOf(first, learner))?.answers).toEqual({ name: "Ada" });
  });

  it("completes the course in the transaction that records the last attendance", async () => {
    const { courseId, sessionIds, lessonKeys } = await series({
      rule: "attended",
      sessions: [{ hours: 24 }, { hours: 48 }],
    });
    const [first, second] = sessionIds as [string, string];
    const learner = await enroll((await slugOf(courseId))!);
    await moveTo(first, -3);
    await moveTo(second, -0.25);

    // The first session from the host's list: its lesson is done, nothing else yet.
    const seat = await registrationOf(first, learner);
    expect(await setAttendance(dbs.app.db, tenant, first, seat!.id, true)).toBe(true);
    expect(Object.keys((await enrollmentOf(learner, courseId))!.lessonProgress)).toEqual([
      lessonKeys[0],
    ]);
    const submissionId = await passWork(learner, courseId);
    expect(await credentialOf(learner, courseId)).toBeUndefined();
    const review = (await mailsOf(learner)).find((mail) => mail.kind === "review_ready");
    expect(review?.payload).toMatchObject({ submissionId, sessionsPending: true });

    // The second by its check-in code, while it runs: the credential comes with it.
    const [row] = await inTenant((tx) => tx.select().from(webinars).where(eq(webinars.id, second)));
    expect(
      await checkIn(dbs.app.db, tenant, {
        slug: row!.slug,
        userId: learner,
        code: row!.checkinCode,
      }),
    ).toBe("done");
    const credential = await credentialOf(learner, courseId);
    expect(credential).toMatchObject({
      evidence: ["artifact", "attendance"],
      sessionCount: 2,
    });
    expect((await enrollmentOf(learner, courseId))?.completedAt).not.toBeNull();
    expect(Object.keys((await enrollmentOf(learner, courseId))!.lessonProgress).sort()).toEqual(
      [...lessonKeys].sort(),
    );
    // What the course page tells them about each session.
    const view = await loadLearnerCourse(
      dbs.app.db,
      tenant,
      (await slugOf(courseId))!,
      learner,
      "en",
    );
    expect(view?.sessions.map((session) => session.outcome)).toEqual(["attended", "attended"]);
    // The Studio's numbers per session.
    const numbers = await courseSessionNumbers(dbs.app.db, tenant.id, courseId);
    expect(numbers.map((session) => [session.registered, session.attended])).toEqual([
      [1, 1],
      [1, 1],
    ]);
    // Visitors of a shared credential are not told it runs at their own pace.
    expect(await loadLandingCourse(dbs.app.db, tenant.id, courseId)).toMatchObject({ live: true });
    // The Open Badge: the criteria say what was asked, the evidence how it was done.
    const shown = (await loadCredential(tenant, credential!.publicId, dbs.app.db))!;
    const badge = await openBadgeFor(dbs.app.db, tenant, shown, {
      t: tenantTranslator(tenant, "en"),
      email: "learner@series.test",
    });
    const document = badge.credential as {
      credentialSubject: { achievement: { criteria: { narrative: string } } };
      evidence: Array<{ name: string; narrative: string }>;
    };
    expect(document.credentialSubject.achievement.criteria.narrative).toMatch(
      /Take part in the live sessions\.$/,
    );
    expect(document.evidence[0]!.name).toMatch(/Pricing page · Attended both live sessions$/);
    expect(document.evidence[0]!.narrative).toMatch(/Attended both live sessions\.$/);
  });

  async function slugOf(courseId: string) {
    const [row] = await inTenant((tx) =>
      tx.select({ slug: courses.slug }).from(courses).where(eq(courses.id, courseId)),
    );
    return row?.slug;
  }

  it("counts a recording watched within the catch-up window, not after it", async () => {
    const { courseId, sessionIds } = await series({
      rule: "attended_or_watched",
      catchUpDays: 7,
      sessions: [{ hours: 24 }],
    });
    const [only] = sessionIds as [string];
    const slug = (await slugOf(courseId))!;
    const inTime = await enroll(slug);
    const late = await enroll(slug);
    await moveTo(only, -48);
    const asset = await recordingFor(only);
    const end = Date.now() - 47 * HOUR;
    await passWork(inTime, courseId);
    await passWork(late, courseId);

    expect(await watch(inTime, asset, new Date(end + 2 * DAY))).toMatchObject({ watched: true });
    expect(await credentialOf(inTime, courseId)).toMatchObject({
      evidence: ["artifact", "relive"],
      sessionCount: 1,
    });

    expect(await watch(late, asset, new Date(end + 8 * DAY))).toMatchObject({ watched: true });
    expect(await credentialOf(late, courseId)).toBeUndefined();
    // The lesson is done all the same: they watched it.
    expect(Object.keys((await enrollmentOf(late, courseId))!.lessonProgress)).toHaveLength(1);
    const missing = await inTenant((tx) =>
      completeCourse(tx, tenant, { userId: late, courseId, now: new Date(end + 9 * DAY) }),
    );
    expect(missing).toEqual({ issued: false, missing: ["sessions"] });
  });

  it("asks nothing of a cancelled session, and finishes those it held back", async () => {
    const { courseId, sessionIds } = await series({
      rule: "attended",
      sessions: [{ hours: 24 }, { hours: 72 }],
    });
    const [first, second] = sessionIds as [string, string];
    const learner = await enroll((await slugOf(courseId))!);
    await moveTo(first, -3);
    await setAttendance(
      dbs.app.db,
      tenant,
      first,
      (await registrationOf(first, learner))!.id,
      true,
    );
    await passWork(learner, courseId);
    // The second is still to come: missing.
    expect(await credentialOf(learner, courseId)).toBeUndefined();

    expect((await cancelWebinar(dbs.app.db, tenant, second)).ok).toBe(true);
    expect(await credentialOf(learner, courseId)).toMatchObject({
      evidence: ["artifact", "attendance"],
      sessionCount: 1,
    });
  });

  it("finishes learners a gentler rule lets through, and deletes nothing", async () => {
    const { courseId, sessionIds } = await series({
      rule: "attended",
      catchUpDays: null,
      sessions: [{ hours: 24 }],
    });
    const [only] = sessionIds as [string];
    const learner = await enroll((await slugOf(courseId))!);
    await moveTo(only, -48);
    const asset = await recordingFor(only);
    await passWork(learner, courseId);
    await watch(learner, asset, new Date());
    expect(await credentialOf(learner, courseId)).toBeUndefined();

    const editor = (await loadCourseEditor(dbs.app.db, tenant.id, courseId))!;
    const change = await updateCourseSettings(dbs.app.db, tenant, courseId, {
      title: editor.course.title,
      summary: null,
      languages: ["en"],
      estMinutes: 60,
      deliveryMode: "free_async",
      plannedLaunch: null,
      slug: editor.course.slug,
      completionMode: "work",
      sessions: { rule: "attended_or_watched", catchUpDays: 7 },
    });
    expect(change.completed).toBe(1);
    expect(await credentialOf(learner, courseId)).toMatchObject({
      evidence: ["artifact", "relive"],
      sessionCount: 1,
    });
    // Stricter again: the credential stays.
    await updateCourseSettings(dbs.app.db, tenant, courseId, {
      title: editor.course.title,
      summary: null,
      languages: ["en"],
      estMinutes: 60,
      deliveryMode: "free_async",
      plannedLaunch: null,
      slug: editor.course.slug,
      completionMode: "work",
      sessions: { rule: "attended", catchUpDays: null },
    });
    expect((await credentialOf(learner, courseId))?.revokedAt).toBeNull();
  });

  it("refuses a first hand-in after the deadline where the academy says so", async () => {
    const { courseId } = await series({ rule: "none", sessions: [] });
    const slug = (await slugOf(courseId))!;
    await inTenant((tx) =>
      tx
        .update(assignments)
        .set({ dueAt: new Date(Date.now() - HOUR) })
        .where(eq(assignments.courseId, courseId)),
    );
    const refusing: TenantContext = {
      ...tenant,
      settings: { ...tenant.settings, assignments: { late_submissions: "refused" } },
    };
    const learner = await enroll(slug);
    expect(
      await submitAssignment(dbs.app.db, refusing, learner, slug, { text: "Too late" }, noJobs),
    ).toMatchObject({ ok: false, error: "late" });
    // Accepted by default, and marked on the event.
    const accepted = await submitAssignment(
      dbs.app.db,
      tenant,
      learner,
      slug,
      { text: "Late but here" },
      noJobs,
    );
    expect(accepted).toMatchObject({ ok: true, attemptNo: 1 });
    // A revision of work handed in stays open, even where late work is refused.
    await inTenant((tx) =>
      tx
        .update(submissions)
        .set({ status: "needs_revision", decidedAt: new Date() })
        .where(eq(submissions.userId, learner)),
    );
    expect(
      await submitAssignment(dbs.app.db, refusing, learner, slug, { text: "Revised" }, noJobs),
    ).toMatchObject({ ok: true, attemptNo: 2 });
  });

  it("plans the homework reminder two days before the deadline, and again when it moves", async () => {
    const { courseId } = await series({ rule: "none", sessions: [] });
    const slug = (await slugOf(courseId))!;
    const waiting = await enroll(slug);
    const handedIn = await enroll(slug);
    await submitAssignment(dbs.app.db, tenant, handedIn, slug, { text: "Done early" }, noJobs);

    const editor = (await loadCourseEditor(dbs.app.db, tenant.id, courseId))!;
    const outcome = {
      prompt: editor.assignment!.prompt,
      artifactName: editor.assignment!.artifactName,
      submissionTypes: editor.assignment!.submissionTypes,
      rubric: editor.rubric!.definition,
    };
    const due = new Date(Date.now() + 5 * DAY);
    await updateOutcome(dbs.app.db, tenant.id, courseId, { ...outcome, dueAt: due });
    const homework = async (userId: string) =>
      (await mailsOf(userId)).filter(
        (mail) =>
          mail.kind === "course" && (mail.payload as CourseMailPayload).step === "homework_due",
      );
    const [planned] = await homework(waiting);
    expect(planned?.sendAfter).toEqual(new Date(due.getTime() - 2 * DAY));
    expect(await homework(handedIn)).toEqual([]);

    const moved = new Date(Date.now() + 6 * DAY);
    await updateOutcome(dbs.app.db, tenant.id, courseId, { ...outcome, dueAt: moved });
    const replanned = await homework(waiting);
    expect(replanned.map((mail) => [mail.status, mail.note])).toEqual(
      expect.arrayContaining([
        ["skipped", "rescheduled"],
        ["pending", null],
      ]),
    );
    // Someone starting later gets theirs with the enrollment.
    const late = await enroll(slug);
    expect(await homework(late)).toHaveLength(1);

    // At its time it goes to those who still owe the work, and not to one who handed in since.
    await submitAssignment(dbs.app.db, tenant, late, slug, { text: "Now" }, noJobs);
    await inTenant((tx) =>
      tx
        .update(notifications)
        .set({ sendAfter: new Date(Date.now() - 1000) })
        .where(and(eq(notifications.kind, "course"), eq(notifications.status, "pending"))),
    );
    sent.length = 0;
    await dispatchNotifications(dbs.app.db, tenant, { send });
    const to = await emailOf(waiting);
    const reminder = sent.find((mail) => mail.to === to);
    expect(reminder?.subject).toBe("Due in two days: Pricing page");
    expect(reminder?.text).toContain("Hand in your deliverable “Pricing page”");
    const lateAddress = await emailOf(late);
    expect(sent.some((mail) => mail.to === lateAddress)).toBe(false);
    const [skipped] = (await homework(late)).filter((mail) => mail.status === "skipped");
    expect(skipped?.note).toBe("handed_in");
  });

  it("registers a published course's learners for a session added later", async () => {
    const { courseId, slug } = await series({ rule: "none", sessions: [] }).then(async (made) => ({
      ...made,
      slug: (await slugOf(made.courseId))!,
    }));
    const learner = await enroll(slug);
    const lessonId = await createLesson(dbs.app.db, tenant.id, courseId, {
      locale: "en",
      title: "Q&A live",
      userId: author,
    });
    const published = await webinar(courseId, 72);
    expect(await publishWebinar(dbs.app.db, tenant, published)).toEqual({ ok: true });
    await updateLesson(dbs.app.db, tenant.id, lessonId, {
      title: "Q&A live",
      markdown: "",
      criterionIds: [],
      webinarId: published,
      userId: author,
      onSessionsChanged: sessionsChangedFor(tenant),
    });
    expect((await registrationOf(published, learner))?.status).toBe("registered");
    const added = (await mailsOf(learner)).find(
      (mail) =>
        mail.kind === "course" && (mail.payload as CourseMailPayload).step === "session_added",
    );
    expect(added).toBeDefined();

    // A draft becomes a session silently; its publishing brings the seats.
    const other = await createLesson(dbs.app.db, tenant.id, courseId, {
      locale: "en",
      title: "Review live",
      userId: author,
    });
    const draft = await webinar(courseId, 120);
    await updateLesson(dbs.app.db, tenant.id, other, {
      title: "Review live",
      markdown: "",
      criterionIds: [],
      webinarId: draft,
      userId: author,
      onSessionsChanged: sessionsChangedFor(tenant),
    });
    expect(await registrationOf(draft, learner)).toBeUndefined();
    expect(await publishWebinar(dbs.app.db, tenant, draft)).toEqual({ ok: true });
    expect((await registrationOf(draft, learner))?.status).toBe("registered");

    // Cancelling one session leaves the learner on the course, and a later sync respects it.
    const seat = await registrationOf(published, learner);
    expect((await cancelRegistration(dbs.app.db, tenant, { registrationId: seat!.id })).ok).toBe(
      true,
    );
    expect(await enrollmentOf(learner, courseId)).toBeDefined();
    await inTenant((tx) => registerLearnersForSessions(tx, tenant, { courseId, now: new Date() }));
    expect((await registrationOf(published, learner))?.status).toBe("cancelled");
  });

  it("registers learners of a course published again for sessions added meanwhile", async () => {
    const { courseId } = await series({ rule: "none", sessions: [] });
    const learner = await enroll((await slugOf(courseId))!);
    await inTenant((tx) =>
      tx.update(courses).set({ status: "unpublished" }).where(eq(courses.id, courseId)),
    );
    const lessonId = await createLesson(dbs.app.db, tenant.id, courseId, {
      locale: "en",
      title: "Kick-off",
      userId: author,
    });
    const kickOff = await webinar(courseId, 48);
    expect(await publishWebinar(dbs.app.db, tenant, kickOff)).toEqual({ ok: true });
    await updateLesson(dbs.app.db, tenant.id, lessonId, {
      title: "Kick-off",
      markdown: "Be there.",
      criterionIds: [],
      webinarId: kickOff,
      userId: author,
      onSessionsChanged: sessionsChangedFor(tenant),
    });
    // Unpublished: nobody is registered yet.
    expect(await registrationOf(kickOff, learner)).toBeUndefined();
    const check = await publishCourse(dbs.app.db, tenant.id, courseId, {
      onPublished: (tx, id) =>
        registerLearnersForSessions(tx, tenant, { courseId: id, now: new Date() }),
    });
    expect(check.ok).toBe(true);
    expect((await registrationOf(kickOff, learner))?.status).toBe("registered");
  });

  it("keeps a webinar to one course and one lesson", async () => {
    const first = await series({ rule: "none", sessions: [{ hours: 24 }] });
    const second = await series({ rule: "none", sessions: [] });
    const lessonId = await createLesson(dbs.app.db, tenant.id, second.courseId, {
      locale: "en",
      title: "Borrowed",
      userId: author,
    });
    expect(
      await updateLesson(dbs.app.db, tenant.id, lessonId, {
        title: "Borrowed",
        markdown: "",
        criterionIds: [],
        webinarId: first.sessionIds[0]!,
        userId: author,
      }),
    ).toMatchObject({ changed: false, sessionRefused: true });
  });

  it("exports the series' registrations and evidence with the learner's data", async () => {
    const { courseId, sessionIds } = await series({
      rule: "attended",
      sessions: [{ hours: 24 }],
    });
    const learner = await enroll((await slugOf(courseId))!);
    await moveTo(sessionIds[0]!, -3);
    await setAttendance(
      dbs.app.db,
      tenant,
      sessionIds[0]!,
      (await registrationOf(sessionIds[0]!, learner))!.id,
      true,
    );
    await passWork(learner, courseId);
    const data = await exportMyData(dbs.app.db, tenant, learner);
    expect(data.credentials[0]).toMatchObject({
      evidence: ["artifact", "attendance"],
      sessionCount: 1,
    });
    expect(data.webinarRegistrations).toHaveLength(1);
    expect(data.webinarAttendance).toHaveLength(1);
    expect(data.mails.some((mail) => mail.kind === "course")).toBe(true);
  });
  it("lets the series' learners watch a session's recording, not a linked course's", async () => {
    const { courseId, sessionIds } = await series({
      rule: "attended_or_watched",
      sessions: [{ hours: 24 }],
    });
    const learner = await enroll((await slugOf(courseId))!);
    await moveTo(sessionIds[0]!, -3);
    const recording = await recordingFor(sessionIds[0]!);
    // Their seat is gone, the series is not: they catch up in the course.
    await inTenant((tx) =>
      tx
        .update(webinarRegistrations)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(eq(webinarRegistrations.webinarId, sessionIds[0]!)),
    );
    expect(await inTenant((tx) => signedUpIn(tx, learner, [recording]))).toEqual(
      new Set([recording]),
    );

    // A webinar that only leads into a course keeps its recording for its registrants.
    const { courseId: linkedCourse } = await series({ rule: "none", sessions: [] });
    const standalone = await webinar(linkedCourse, 24);
    expect(await publishWebinar(dbs.app.db, tenant, standalone)).toEqual({ ok: true });
    await moveTo(standalone, -3);
    const standaloneRecording = await recordingFor(standalone);
    const courseLearner = await enroll((await slugOf(linkedCourse))!);
    expect(await inTenant((tx) => signedUpIn(tx, courseLearner, [standaloneRecording]))).toEqual(
      new Set(),
    );
  });
});
