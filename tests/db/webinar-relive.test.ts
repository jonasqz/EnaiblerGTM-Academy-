import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { and, eq, sql } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { tenantTranslator } from "@/core/i18n/tenant-translator";
import type { TenantContext } from "@/core/tenant/context";
import type { WebinarSetup } from "@/core/webinars/setup";
import {
  courses,
  mediaAssets,
  memberships,
  notifications,
  user,
  webinarRegistrations,
  webinars,
  type WebinarMailPayload,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import type { OutgoingEmail } from "@/server/email/mailer";
import { deleteVideo, loadVideo, updateVideo } from "@/server/media/library";
import { recordProgress } from "@/server/media/progress";
import { mediaViewers, servableVideo, type MediaSession } from "@/server/media/viewer";
import { dispatchNotifications } from "@/server/notifications";
import { exportAcademy } from "@/server/operator/academies";
import { exportMyData } from "@/server/profile";
import { loadWebinarPage, myWebinars } from "@/server/webinars/public";
import {
  attachRecording,
  detachRecording,
  reliveNumbers,
  setReliveAccess,
  webinarShowing,
} from "@/server/webinars/recording";
import {
  cancelRegistration,
  confirmRegistration,
  registerSignedIn,
  startRegistration,
  type RegistrationRequest,
} from "@/server/webinars/registration";
import { queueReliveMails } from "@/server/webinars/relive-mail";
import {
  createWebinar,
  publishWebinar,
  setAttendance,
  updateWebinarSetup,
  webinarFunnel,
} from "@/server/webinars/studio";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

const HOUR = 60 * 60_000;

/*
 * Re-live on webinars (webinar brief §2.4, §3, §5): who may watch the
 * recording, the confirmation a wider audience needs, the one mail each
 * registrant gets, registering for the recording after the end, the numbers,
 * and a deleted video leaving its webinar first.
 */
describe.skipIf(!hasDatabase)("webinar re-live", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let other: TenantContext;
  let courseId: string;
  let author: string;
  const sent: OutgoingEmail[] = [];
  const send = async (mail: OutgoingEmail) => {
    sent.push(mail);
  };

  const t = () => tenantTranslator(tenant, "en");
  const request = (extra: Partial<RegistrationRequest> = {}): RegistrationRequest => ({
    answers: { name: "Ada" },
    marketing: false,
    leadHandoff: false,
    locale: "en",
    entry: {},
    ...extra,
  });
  const learnerSession = (userId: string): MediaSession => ({ userId, roles: ["learner"] });
  const tracked = (userId: string) => ({ userId, member: true, canEditCourses: false });

  async function emailOf(userId: string): Promise<string> {
    const [row] = await dbs.owner.db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, userId));
    return row!.email;
  }

  async function learner(academy: TenantContext = tenant): Promise<string> {
    const id = await createUser(dbs.owner.db);
    await withTenant(dbs.owner.db, academy.id, (tx) =>
      tx.insert(memberships).values({ tenantId: academy.id, userId: id, role: "learner" }),
    );
    return id;
  }

  /** A published webinar two days ahead, leading into the course. */
  async function published(
    options: { capacity?: number | null; title?: string } = {},
  ): Promise<{ id: string; slug: string }> {
    const title = options.title ?? "Pricing live";
    const id = await createWebinar(dbs.app.db, tenant.id, {
      title,
      locale: "en",
      startsAt: new Date(Date.now() + 48 * HOUR),
      timeZone: "Europe/Berlin",
      durationMinutes: 60,
      createdBy: author,
    });
    const [row] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(webinars).where(eq(webinars.id, id)),
    );
    const setup: WebinarSetup = {
      slug: row!.slug,
      locale: "en",
      title,
      description: "We build a pricing page together.",
      startsAt: row!.startsAt,
      timeZone: "Europe/Berlin",
      durationMinutes: 60,
      capacity: options.capacity ?? null,
      joinUrl: "https://meet.example.com/abc-defg-hij",
      courseId,
      recorded: true,
      recordingNotice: null,
    };
    expect((await updateWebinarSetup(dbs.app.db, tenant, id, setup)).ok).toBe(true);
    expect(await publishWebinar(dbs.app.db, tenant, id)).toEqual({ ok: true });
    return { id, slug: row!.slug };
  }

  /**
   * The session took place: it ended `hours` ago (published webinars cannot
   * be moved there). As if the time had passed, everyone registered before
   * it, the mails before the end went out, and the follow-up waits for this
   * start.
   */
  const endIt = async (webinarId: string, hours = 3) => {
    const startsAt = new Date(Date.now() - hours * HOUR - HOUR);
    await withTenant(dbs.app.db, tenant.id, async (tx) => {
      await tx.update(webinars).set({ startsAt }).where(eq(webinars.id, webinarId));
      await tx
        .update(webinarRegistrations)
        .set({ confirmedAt: new Date(startsAt.getTime() - 24 * HOUR) })
        .where(
          and(
            eq(webinarRegistrations.webinarId, webinarId),
            sql`${webinarRegistrations.confirmedAt} is not null`,
          ),
        );
      const pending = and(
        eq(notifications.status, "pending"),
        sql`${notifications.payload}->>'webinarId' = ${webinarId}`,
      );
      await tx
        .update(notifications)
        .set({ status: "sent", processedAt: new Date() })
        .where(and(pending, sql`${notifications.payload}->>'step' <> 'followup'`));
      await tx
        .update(notifications)
        .set({
          payload: sql`jsonb_set(${notifications.payload}, '{plannedFor}', to_jsonb(${startsAt.toISOString()}::text))`,
        })
        .where(and(pending, sql`${notifications.payload}->>'step' = 'followup'`));
    });
  };

  async function register(slug: string, userId?: string) {
    const id = userId ?? (await createUser(dbs.owner.db));
    const result = await registerSignedIn(dbs.app.db, tenant, {
      slug,
      userId: id,
      email: await emailOf(id),
      request: request(),
      t: t(),
    });
    return { userId: id, result };
  }

  async function video(
    values: Partial<typeof mediaAssets.$inferInsert> = {},
    academy: TenantContext = tenant,
  ): Promise<string> {
    const [row] = await withTenant(dbs.app.db, academy.id, (tx) =>
      tx
        .insert(mediaAssets)
        .values({
          tenantId: academy.id,
          kind: "upload",
          status: "ready",
          title: "Pricing live: the recording",
          hlsRun: "rtest000001",
          durationSec: 600,
          readyAt: new Date(),
          ...values,
        })
        .returning({ id: mediaAssets.id }),
    );
    return row!.id;
  }

  const webinarRow = async (id: string) =>
    (
      await withTenant(dbs.app.db, tenant.id, (tx) =>
        tx.select().from(webinars).where(eq(webinars.id, id)),
      )
    )[0]!;

  const registrationOf = async (webinarId: string, userId: string) =>
    (
      await withTenant(dbs.app.db, tenant.id, (tx) =>
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
    )[0]!;

  const mails = (webinarId: string) =>
    withTenant(dbs.app.db, tenant.id, async (tx) =>
      (
        await tx
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.kind, "webinar"),
              sql`${notifications.payload}->>'webinarId' = ${webinarId}`,
            ),
          )
          .orderBy(notifications.createdAt)
      ).map((row) => ({ ...row, payload: row.payload as WebinarMailPayload })),
    );

  const makeDue = (webinarId: string) =>
    withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .update(notifications)
        .set({ sendAfter: sql`now() - interval '1 second'` })
        .where(
          and(
            eq(notifications.status, "pending"),
            sql`${notifications.payload}->>'webinarId' = ${webinarId}`,
          ),
        ),
    );

  /** Marks a registrant's follow-up as gone out already (before any recording existed). */
  const followupWentOut = (registrationId: string) =>
    withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .update(notifications)
        .set({ status: "sent", processedAt: new Date() })
        .where(
          and(
            sql`${notifications.payload}->>'registrationId' = ${registrationId}`,
            sql`${notifications.payload}->>'step' = 'followup'`,
          ),
        ),
    );

  const mailTo = (userId: string) => sent.filter((mail) => mail.to === `${userId}@learners.test`);

  /** Recordings earlier tests left for the sweep: it runs for the whole academy. */
  const settle = () => queueReliveMails(dbs.app.db, tenant.id);

  beforeAll(async () => {
    process.env.DATA_ENCRYPTION_SECRET ??= "test-data-encryption-secret-0123456789";
    dbs = await openTestDatabases();
    tenant = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    other = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    author = await createUser(dbs.owner.db);
    await withTenant(dbs.owner.db, tenant.id, (tx) =>
      tx.insert(memberships).values({ tenantId: tenant.id, userId: author, role: "author" }),
    );
    const { createCourse } = await import("@/server/studio/courses");
    courseId = await createCourse(dbs.app.db, tenant.id, {
      languages: ["en"],
      title: "Pricing that sells",
      artifactName: "Pricing page",
      outcome: "Build your pricing page.",
      deliveryMode: "free_async",
    });
    // The mails lead into it only once it is published.
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .update(courses)
        .set({ status: "published", publishedAt: new Date() })
        .where(eq(courses.id, courseId)),
    );
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("plays the recording for its registrants only: a seat or the waitlist, signed in", async () => {
    const { id, slug } = await published({ capacity: 1 });
    const seated = await register(slug);
    const waiting = await register(slug);
    const leaving = await register(slug);
    expect([seated, waiting, leaving].map((entry) => entry.result)).toMatchObject([
      { status: "registered" },
      { status: "waitlist" },
      { status: "waitlist" },
    ]);
    const leavingRow = await registrationOf(id, leaving.userId);
    expect(
      await cancelRegistration(dbs.app.db, tenant, {
        registrationId: leavingRow.id,
        userId: leaving.userId,
      }),
    ).toMatchObject({ ok: true });
    // Someone who sent the form but never clicked the link.
    const visitor = await createUser(dbs.owner.db);
    await startRegistration(dbs.app.db, tenant, {
      slug,
      email: await emailOf(visitor),
      request: request(),
      t: t(),
    });
    const bystander = await learner();
    const recording = await video();
    expect(await attachRecording(dbs.app.db, tenant.id, id, recording)).toEqual({ ok: true });
    expect((await loadVideo(dbs.app.db, tenant.id, recording))?.access).toBe("registrants");

    const serves = (session: MediaSession | null, academy: TenantContext = tenant) =>
      servableVideo(dbs.app.db, academy.id, recording, async () => session).then(
        (asset) => asset !== null,
      );
    expect(await serves(learnerSession(seated.userId))).toBe(true);
    expect(await serves(learnerSession(waiting.userId))).toBe(true);
    expect(await serves(learnerSession(leaving.userId))).toBe(false);
    expect(await serves(learnerSession(visitor))).toBe(false);
    expect(await serves(learnerSession(bystander))).toBe(false);
    expect(await serves(null)).toBe(false);
    expect(await serves({ userId: author, roles: ["author"] })).toBe(true);
    // Another academy never finds the video, whoever asks.
    expect(await serves(learnerSession(seated.userId), other)).toBe(false);

    // The progress API asks the same.
    const report = { asset: recording, ranges: [[0, 60]] as Array<[number, number]> };
    expect(await recordProgress(dbs.app.db, tenant, tracked(seated.userId), report)).toMatchObject({
      percent: 10,
    });
    expect(
      await recordProgress(dbs.app.db, tenant, tracked(waiting.userId), report),
    ).not.toBeNull();
    expect(await recordProgress(dbs.app.db, tenant, tracked(leaving.userId), report)).toBeNull();
    expect(await recordProgress(dbs.app.db, tenant, tracked(bystander), report)).toBeNull();
    expect(await recordProgress(dbs.app.db, other, tracked(seated.userId), report)).toBeNull();

    // So do pages: the viewer of each video they show.
    const viewerOf = await mediaViewers(dbs.app.db, tenant.id, learnerSession(bystander), [
      { id: recording, access: "registrants" },
    ]);
    expect(viewerOf(recording)).toEqual({ member: true, canEditCourses: false, signedUp: false });
    const seatedViewer = await mediaViewers(dbs.app.db, tenant.id, learnerSession(seated.userId), [
      { id: recording, access: "registrants" },
    ]);
    expect(seatedViewer(recording)?.signedUp).toBe(true);

    // All learners: the bystander may watch too, anonymous visitors still not.
    await setReliveAccess(dbs.app.db, tenant.id, id, "learners", {
      confirmed: true,
      userId: author,
    });
    expect(await serves(learnerSession(bystander))).toBe(true);
    expect(await serves(null)).toBe(false);
    await setReliveAccess(dbs.app.db, tenant.id, id, "public", { confirmed: true, userId: author });
    expect(await serves(null)).toBe(true);
    // Registered for another webinar: that one's recording only.
    const second = await published({ title: "Second session" });
    const elsewhere = await register(second.slug);
    const secondRecording = await video();
    await attachRecording(dbs.app.db, tenant.id, second.id, secondRecording);
    expect(
      await servableVideo(dbs.app.db, tenant.id, secondRecording, async () =>
        learnerSession(seated.userId),
      ),
    ).toBeNull();
    expect(
      await servableVideo(dbs.app.db, tenant.id, secondRecording, async () =>
        learnerSession(elsewhere.userId),
      ),
    ).not.toBeNull();
  });

  it("widens who may watch only with the host's confirmation, and the video follows", async () => {
    const { id } = await published();
    expect(
      await setReliveAccess(dbs.app.db, tenant.id, id, "public", {
        confirmed: true,
        userId: author,
      }),
    ).toEqual({ ok: false, issue: "no_recording" });
    const recording = await video({ access: "learners" });
    await attachRecording(dbs.app.db, tenant.id, id, recording);
    // Attaching makes it the webinar's: registrants only, whatever it was.
    expect((await loadVideo(dbs.app.db, tenant.id, recording))?.access).toBe("registrants");
    expect(
      await setReliveAccess(dbs.app.db, tenant.id, id, "public", {
        confirmed: false,
        userId: author,
      }),
    ).toEqual({ ok: false, issue: "confirmation_missing" });
    expect(await webinarRow(id)).toMatchObject({
      reliveAccess: "registrants",
      reliveConfirmedAt: null,
    });

    const now = new Date("2026-09-29T10:00:00Z");
    expect(
      await setReliveAccess(dbs.app.db, tenant.id, id, "public", {
        confirmed: true,
        userId: author,
        now,
      }),
    ).toMatchObject({ ok: true, confirmation: "record" });
    expect(await webinarRow(id)).toMatchObject({
      reliveAccess: "public",
      reliveConfirmedAt: now,
      reliveConfirmedBy: author,
    });
    expect((await loadVideo(dbs.app.db, tenant.id, recording))?.access).toBe("public");
    // Studio → Videos cannot change it behind the webinar's back.
    expect(await updateVideo(dbs.app.db, tenant.id, recording, { access: "learners" })).toBe("ok");
    expect((await loadVideo(dbs.app.db, tenant.id, recording))?.access).toBe("public");
    expect(await webinarShowing(dbs.app.db, tenant.id, recording)).toMatchObject({
      id,
      reliveAccess: "public",
    });

    // Narrowing needs nothing; back at registrants the confirmation is gone.
    expect(
      await setReliveAccess(dbs.app.db, tenant.id, id, "learners", {
        confirmed: false,
        userId: author,
      }),
    ).toMatchObject({ ok: true });
    expect(await webinarRow(id)).toMatchObject({
      reliveAccess: "learners",
      reliveConfirmedAt: now,
    });
    await setReliveAccess(dbs.app.db, tenant.id, id, "registrants", {
      confirmed: false,
      userId: author,
    });
    expect(await webinarRow(id)).toMatchObject({
      reliveAccess: "registrants",
      reliveConfirmedAt: null,
      reliveConfirmedBy: null,
    });
    expect((await loadVideo(dbs.app.db, tenant.id, recording))?.access).toBe("registrants");

    // A video is the recording of one webinar at most; another academy's is none of ours.
    const second = await published({ title: "Another one" });
    expect(await attachRecording(dbs.app.db, tenant.id, second.id, recording)).toEqual({
      ok: false,
      issue: "in_use",
    });
    expect(await attachRecording(dbs.app.db, tenant.id, second.id, await video({}, other))).toEqual(
      { ok: false, issue: "video_not_found" },
    );
    await expect(
      withTenant(dbs.app.db, tenant.id, (tx) =>
        tx.update(webinars).set({ recordingAssetId: recording }).where(eq(webinars.id, second.id)),
      ),
    ).rejects.toThrow();

    // Another video starts over: the confirmation was about the first one.
    await setReliveAccess(dbs.app.db, tenant.id, id, "public", { confirmed: true, userId: author });
    const replacement = await video();
    expect(await attachRecording(dbs.app.db, tenant.id, id, replacement)).toEqual({ ok: true });
    expect(await webinarRow(id)).toMatchObject({
      recordingAssetId: replacement,
      reliveAccess: "registrants",
      reliveConfirmedAt: null,
    });
    // The first video keeps what it had and belongs to no webinar any more.
    expect(await webinarShowing(dbs.app.db, tenant.id, recording)).toBeNull();
    expect(await detachRecording(dbs.app.db, tenant.id, id)).toBe(true);
    expect((await webinarRow(id)).recordingAssetId).toBeNull();
  });

  it("mails the recording once to every registrant, attendees and no-shows alike", async () => {
    const { id, slug } = await published({ capacity: 3, title: "Mail live" });
    const [attendee, noShow, late, waiting] = [
      await register(slug),
      await register(slug),
      await register(slug),
      await register(slug),
    ];
    const extra = await register(slug);
    expect([waiting, extra].map((entry) => entry.result)).toMatchObject([
      { status: "waitlist" },
      { status: "waitlist" },
    ]);
    const dropped = await register(slug);
    const droppedRow = await registrationOf(id, dropped.userId);
    await cancelRegistration(dbs.app.db, tenant, {
      registrationId: droppedRow.id,
      userId: dropped.userId,
    });
    await setAttendance(
      dbs.app.db,
      tenant,
      id,
      (await registrationOf(id, attendee.userId)).id,
      true,
    );
    await endIt(id);
    // Their follow-ups went out an hour after the end, before any recording existed.
    for (const person of [attendee, noShow, waiting]) {
      await followupWentOut((await registrationOf(id, person.userId)).id);
    }

    await settle();
    const recording = await video({ status: "processing", hlsRun: null, readyAt: null });
    await attachRecording(dbs.app.db, tenant.id, id, recording);
    expect(await queueReliveMails(dbs.app.db, tenant.id)).toBe(0);

    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .update(mediaAssets)
        .set({ status: "ready", hlsRun: "rtest000001" })
        .where(eq(mediaAssets.id, recording)),
    );
    // Seat holders, the waitlist, and the one whose follow-up still waits (it is upgraded).
    expect(await queueReliveMails(dbs.app.db, tenant.id)).toBe(5);
    expect(await queueReliveMails(dbs.app.db, tenant.id)).toBe(0);
    const queued = await mails(id);
    const relive = queued.filter((row) => row.payload.step === "relive");
    expect(relive.map((row) => row.userId).sort()).toEqual(
      [attendee.userId, noShow.userId, waiting.userId, extra.userId].sort(),
    );
    const upgraded = queued.filter(
      (row) => row.userId === late.userId && row.payload.step === "followup",
    );
    expect(upgraded).toMatchObject([{ status: "pending", payload: { recording: true } }]);
    expect(
      queued.some((row) => row.userId === dropped.userId && row.payload.step === "relive"),
    ).toBe(false);

    // Prepared again, or detached and attached again: nobody gets it twice.
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.update(mediaAssets).set({ status: "processing" }).where(eq(mediaAssets.id, recording)),
    );
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.update(mediaAssets).set({ status: "ready" }).where(eq(mediaAssets.id, recording)),
    );
    expect(await queueReliveMails(dbs.app.db, tenant.id)).toBe(0);
    await detachRecording(dbs.app.db, tenant.id, id);
    await attachRecording(dbs.app.db, tenant.id, id, await video());
    expect(await queueReliveMails(dbs.app.db, tenant.id)).toBe(0);

    sent.length = 0;
    await makeDue(id);
    await dispatchNotifications(dbs.app.db, tenant, { send, limit: 200 });
    expect(mailTo(attendee.userId).map((mail) => mail.subject)).toEqual([
      "The recording is ready: Mail live",
    ]);
    expect(mailTo(noShow.userId).map((mail) => mail.subject)).toEqual([
      "Missed it? Here's the recording: Mail live",
    ]);
    expect(mailTo(waiting.userId).map((mail) => mail.subject)).toEqual([
      "Missed it? Here's the recording: Mail live",
    ]);
    // The follow-up brings it instead: one mail, not two.
    expect(mailTo(late.userId).map((mail) => mail.subject)).toEqual([
      "After the webinar: Mail live",
    ]);
    for (const person of [attendee, noShow, waiting, late, extra]) {
      const withRecording = mailTo(person.userId).filter((mail) =>
        mail.html.includes(`/webinars/${slug}#recording`),
      );
      expect(withRecording, person.userId).toHaveLength(1);
      // With the homework: the linked course, the webinar as its source.
      expect(withRecording[0]!.html).toContain("/start?");
      expect(withRecording[0]!.html).toContain("utm_campaign=mail-live");
    }
    // A recording says when it was made, never when to be there.
    expect(mailTo(noShow.userId)[0]!.text).toContain("Recorded on");
    expect(mailTo(noShow.userId)[0]!.text).not.toContain("When:");
    expect(mailTo(dropped.userId)).toEqual([]);
    // The Studio counts them.
    expect((await reliveNumbers(dbs.app.db, tenant, id))?.mailed).toBe(5);
  });

  it("does not send a recording mail for a recording taken off before it went out", async () => {
    const { id, slug } = await published({ title: "Taken off" });
    const person = await register(slug);
    await endIt(id);
    await followupWentOut((await registrationOf(id, person.userId)).id);
    await settle();
    const recording = await video();
    await attachRecording(dbs.app.db, tenant.id, id, recording);
    expect(await queueReliveMails(dbs.app.db, tenant.id)).toBe(1);
    await detachRecording(dbs.app.db, tenant.id, id);
    sent.length = 0;
    await makeDue(id);
    await dispatchNotifications(dbs.app.db, tenant, { send, limit: 200 });
    expect(mailTo(person.userId)).toEqual([]);
    expect((await mails(id)).find((row) => row.payload.step === "relive")).toMatchObject({
      status: "skipped",
      note: "no_recording",
    });
    // Shown again later, it reaches them after all, once.
    await attachRecording(dbs.app.db, tenant.id, id, recording);
    expect(await queueReliveMails(dbs.app.db, tenant.id)).toBe(1);
    expect(await queueReliveMails(dbs.app.db, tenant.id)).toBe(0);
  });

  it("takes registrations for the recording after the end: no seats, no reminders", async () => {
    const { id, slug } = await published({ capacity: 1, title: "Evergreen" });
    const seated = await register(slug);
    await endIt(id);
    // Over without a recording: closed.
    expect((await register(slug)).result).toEqual({ ok: false, error: "closed" });

    const recording = await video({ status: "processing", hlsRun: null, readyAt: null });
    await attachRecording(dbs.app.db, tenant.id, id, recording);
    const early = await register(slug);
    // The room was full, but a recording has room for everyone.
    expect(early.result).toMatchObject({ ok: true, status: "registered" });
    const earlyMails = (await mails(id)).filter((row) => row.userId === early.userId);
    expect(earlyMails.map((row) => row.payload)).toEqual([
      expect.objectContaining({ step: "relive_confirmation" }),
    ]);
    expect(earlyMails[0]!.payload.recording).toBeUndefined();
    expect((await registrationOf(id, early.userId)).reliveMailedAt).toBeNull();

    sent.length = 0;
    await dispatchNotifications(dbs.app.db, tenant, { send, limit: 200 });
    const confirmation = mailTo(early.userId)[0];
    expect(confirmation?.subject).toBe("Your recording: Evergreen");
    expect(confirmation?.text).toContain("The recording is being prepared");
    expect(confirmation?.calendar).toBeUndefined();

    // Ready: the one who waited for it hears that it's ready.
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .update(mediaAssets)
        .set({ status: "ready", hlsRun: "rtest000001" })
        .where(eq(mediaAssets.id, recording)),
    );
    await followupWentOut((await registrationOf(id, seated.userId)).id);
    const queued = await queueReliveMails(dbs.app.db, tenant.id);
    expect(
      (await mails(id)).filter((row) => row.payload.step === "relive").map((row) => row.userId),
    ).toEqual(expect.arrayContaining([seated.userId, early.userId]));
    expect(queued).toBeGreaterThanOrEqual(2);
    sent.length = 0;
    await makeDue(id);
    await dispatchNotifications(dbs.app.db, tenant, { send, limit: 200 });
    expect(mailTo(early.userId).map((mail) => mail.subject)).toEqual([
      "The recording is ready: Evergreen",
    ]);

    // Registering once it is ready: the confirmation brings it, nothing else follows.
    const visitor = await createUser(dbs.owner.db);
    const started = await startRegistration(dbs.app.db, tenant, {
      slug,
      email: await emailOf(visitor),
      request: request({ locale: "de" }),
      t: tenantTranslator(tenant, "de"),
    });
    if (!started.ok) throw new Error(started.error);
    expect(
      await confirmRegistration(dbs.app.db, tenant, {
        slug,
        token: started.token,
        userId: visitor,
        email: await emailOf(visitor),
      }),
    ).toMatchObject({ ok: true, status: "registered" });
    const row = await registrationOf(id, visitor);
    expect(row.reliveMailedAt).toBeInstanceOf(Date);
    // What they agreed to was the recording, not a session to appear in.
    expect(row.consents[0]?.wording).toContain("Aufzeichnung");
    expect(row.consents[0]?.wording).not.toContain("Kamera");
    expect(await queueReliveMails(dbs.app.db, tenant.id)).toBe(0);
    sent.length = 0;
    await dispatchNotifications(dbs.app.db, tenant, { send, limit: 200 });
    const mail = mailTo(visitor);
    expect(mail.map((each) => each.subject)).toEqual(["Deine Aufzeichnung: Evergreen"]);
    expect(mail[0]?.html).toContain(`/webinars/${slug}#recording`);
    expect(mail[0]?.text).toContain("Aufgezeichnet am");

    // The page and "My learning" show it as a recording.
    const page = await loadWebinarPage(dbs.app.db, tenant.id, slug, { drafts: false });
    expect(page?.recording?.id).toBe(recording);
    expect(page?.webinar).not.toHaveProperty("reliveConfirmedBy");
    expect((await myWebinars(dbs.app.db, tenant.id, visitor))[0]).toMatchObject({
      relive: "ready",
    });
  });

  it("counts who watched the recording and how many no-shows caught up", async () => {
    const { id, slug } = await published({ capacity: 3, title: "Numbers live" });
    const attendee = await register(slug);
    const caughtUp = await register(slug);
    const barely = await register(slug);
    const waiting = await register(slug);
    await setAttendance(
      dbs.app.db,
      tenant,
      id,
      (await registrationOf(id, attendee.userId)).id,
      true,
    );
    await endIt(id);
    const recording = await video();
    await attachRecording(dbs.app.db, tenant.id, id, recording);
    await setReliveAccess(dbs.app.db, tenant.id, id, "learners", {
      confirmed: true,
      userId: author,
    });
    const lateComer = await register(slug);
    const bystander = await learner();
    const watch = (userId: string, seconds: number) =>
      recordProgress(dbs.app.db, tenant, tracked(userId), {
        asset: recording,
        ranges: [[0, seconds]],
      });
    await watch(attendee.userId, 600);
    await watch(caughtUp.userId, 540);
    await watch(barely.userId, 60);
    await watch(lateComer.userId, 600);
    // Learners may watch too, but they are not the webinar's audience.
    await watch(bystander, 600);

    const numbers = await reliveNumbers(dbs.app.db, tenant, id);
    expect(numbers).toMatchObject({
      assetId: recording,
      watched: 3,
      // The no-shows: caughtUp, barely and the waitlist; the late comer came for the recording.
      catchUp: { missed: 3, caughtUp: 1, rate: 33 },
    });
    const funnel = await webinarFunnel(dbs.app.db, tenant, id);
    expect(funnel?.find((row) => row.step === "attended")?.count).toBe(1);
    expect(funnel?.find((row) => row.step === "relive_watched")?.count).toBe(3);
    expect(funnel?.map((row) => row.step).indexOf("relive_watched")).toBe(4);
    expect(waiting.result).toMatchObject({ status: "waitlist" });
  });

  it("takes a deleted video off its webinar first", async () => {
    const { id, slug } = await published({ title: "Deleted live" });
    await register(slug);
    await endIt(id);
    const recording = await video();
    await attachRecording(dbs.app.db, tenant.id, id, recording);
    await setReliveAccess(dbs.app.db, tenant.id, id, "public", { confirmed: true, userId: author });
    expect(await deleteVideo(dbs.app.db, tenant.id, recording)).toBe(true);
    expect(await loadVideo(dbs.app.db, tenant.id, recording)).toBeNull();
    expect(await webinarRow(id)).toMatchObject({
      recordingAssetId: null,
      reliveAccess: "registrants",
      reliveConfirmedAt: null,
    });
    const page = await loadWebinarPage(dbs.app.db, tenant.id, slug, { drafts: false });
    expect(page?.recording).toBeNull();
    await queueReliveMails(dbs.app.db, tenant.id);
    expect((await mails(id)).filter((row) => row.payload.step === "relive")).toEqual([]);
  });

  it("hands learners what was mailed to them, and the academy all of it", async () => {
    const { id, slug } = await published({ title: "Exported live" });
    const person = await register(slug);
    await endIt(id);
    await followupWentOut((await registrationOf(id, person.userId)).id);
    await attachRecording(dbs.app.db, tenant.id, id, await video());
    await queueReliveMails(dbs.app.db, tenant.id);
    const exported = await exportMyData(dbs.app.db, tenant, person.userId);
    expect(exported.webinarRegistrations).toEqual([
      expect.objectContaining({ webinar: slug, recordingMailedAt: expect.any(Date) }),
    ]);
    const target = join(tmpdir(), `academy-${tenant.id}-relive.zip`);
    await exportAcademy(dbs.owner.db, tenant.id, target, { withFiles: false });
    const zip = unzipSync(readFileSync(target));
    const rows = JSON.parse(strFromU8(zip["data/webinar_registrations.json"]!)) as Array<{
      relive_mailed_at: string | null;
    }>;
    expect(rows.some((row) => row.relive_mailed_at !== null)).toBe(true);
    const shown = JSON.parse(strFromU8(zip["data/webinars.json"]!)) as Array<{
      recording_asset_id: string | null;
    }>;
    expect(shown.some((row) => row.recording_asset_id !== null)).toBe(true);
  });
});
