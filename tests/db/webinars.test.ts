import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { and, eq, sql } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { tenantTranslator } from "@/core/i18n/tenant-translator";
import { learnerAlias } from "@/core/people/alias";
import type { TenantContext } from "@/core/tenant/context";
import { parseAttendanceCsv } from "@/core/webinars/attendance-csv";
import { registrationFormSchema } from "@/core/webinars/landing";
import type { WebinarSetup } from "@/core/webinars/setup";
import { createDatabase, type DatabaseHandle } from "@/db/client";
import {
  consents,
  courses,
  events,
  memberships,
  notifications,
  user,
  webinarAttendance,
  webinarRegistrations,
  webinars,
  type WebinarMailPayload,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import type { OutgoingEmail } from "@/server/email/mailer";
import { dispatchNotifications } from "@/server/notifications";
import { exportAcademy } from "@/server/operator/academies";
import { deleteMyData, exportMyData } from "@/server/profile";
import { createCourse } from "@/server/studio/courses";
import { cancelKey, cancelKeyValid } from "@/server/webinars/links";
import { myWebinars, viewerRegistration } from "@/server/webinars/public";
import {
  cancelRegistration,
  checkIn,
  confirmRegistration,
  expirePendingRegistrations,
  registerSignedIn,
  startRegistration,
  type RegistrationRequest,
} from "@/server/webinars/registration";
import {
  cancelWebinar,
  createWebinar,
  importAttendance,
  listRegistrants,
  previewAttendance,
  publishWebinar,
  registrationDigest,
  updateWebinarContent,
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

function pgCode(error: unknown): string | undefined {
  const cause = (error as { cause?: { code?: string } }).cause;
  return cause?.code ?? (error as { code?: string }).code;
}

describe.skipIf(!hasDatabase)("webinars", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let otherTenant: string;
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
    entry: { utm: { source: "linkedin", medium: "post" } },
    ...extra,
  });

  async function emailOf(userId: string): Promise<string> {
    const [row] = await dbs.owner.db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, userId));
    return row!.email;
  }

  async function setup(
    webinarId: string,
    overrides: Partial<WebinarSetup> = {},
  ): Promise<WebinarSetup> {
    const [row] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(webinars).where(eq(webinars.id, webinarId)),
    );
    return {
      slug: row!.slug,
      locale: "en",
      title: row!.title,
      description: "We build a pricing page together.",
      startsAt: row!.startsAt,
      timeZone: "Europe/Berlin",
      durationMinutes: 60,
      capacity: null,
      joinUrl: "https://meet.example.com/abc-defg-hij",
      courseId,
      recorded: false,
      recordingNotice: null,
      ...overrides,
    };
  }

  /** A published webinar starting `hours` from now. */
  async function published(
    options: { capacity?: number | null; hours?: number; title?: string } = {},
  ): Promise<{ id: string; slug: string }> {
    const id = await createWebinar(dbs.app.db, tenant.id, {
      title: options.title ?? "Pricing live",
      locale: "en",
      startsAt: new Date(Date.now() + (options.hours ?? 48) * HOUR),
      timeZone: "Europe/Berlin",
      durationMinutes: 60,
      createdBy: author,
    });
    const saved = await updateWebinarSetup(
      dbs.app.db,
      tenant,
      id,
      await setup(id, { capacity: options.capacity ?? null }),
    );
    expect(saved.ok).toBe(true);
    expect(await publishWebinar(dbs.app.db, tenant, id)).toEqual({ ok: true });
    const [row] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select({ slug: webinars.slug }).from(webinars).where(eq(webinars.id, id)),
    );
    return { id, slug: row!.slug };
  }

  async function signedInRegistration(slug: string, userId?: string) {
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
          .orderBy(notifications.sendAfter)
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

  const registrationsOf = (webinarId: string) =>
    withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .select()
        .from(webinarRegistrations)
        .where(eq(webinarRegistrations.webinarId, webinarId))
        .orderBy(webinarRegistrations.createdAt),
    );

  beforeAll(async () => {
    // Cancel links in mail carry a key derived from the data secret.
    process.env.DATA_ENCRYPTION_SECRET ??= "test-data-encryption-secret-0123456789";
    dbs = await openTestDatabases();
    tenant = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    otherTenant = await createTenant(dbs.owner.db);
    author = await createUser(dbs.owner.db);
    courseId = await createCourse(dbs.app.db, tenant.id, {
      languages: ["en"],
      title: "Pricing that sells",
      artifactName: "Pricing page",
      outcome: "Build your pricing page.",
      deliveryMode: "free_async",
    });
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("keeps webinars inside their academy", async () => {
    const { id } = await published();
    const seenByOther = await withTenant(dbs.app.db, otherTenant, (tx) =>
      tx.select().from(webinars).where(eq(webinars.id, id)),
    );
    expect(seenByOther).toEqual([]);
    // Another academy's webinar cannot lead into this academy's course.
    await expect(
      withTenant(dbs.app.db, otherTenant, (tx) =>
        tx.insert(webinars).values({
          tenantId: otherTenant,
          slug: "stolen",
          locale: "en",
          title: "Stolen",
          startsAt: new Date(),
          timeZone: "UTC",
          durationMinutes: 60,
          courseId,
          blocks: [],
          form: registrationFormSchema.parse({}),
          checkinCode: "ABCDEF",
        }),
      ),
    ).rejects.toSatisfy((error) => pgCode(error) === "23503");
  });

  it("registers a visitor once the magic link proves the address", async () => {
    const { id, slug } = await published();
    const learner = await createUser(dbs.owner.db);
    const email = await emailOf(learner);

    const started = await startRegistration(dbs.app.db, tenant, {
      slug,
      email: email.toUpperCase(),
      request: request({ leadHandoff: true, marketing: true }),
      t: t(),
    });
    if (!started.ok) throw new Error(started.error);
    const [pending] = await registrationsOf(id);
    expect(pending).toMatchObject({ status: "pending", userId: null, email });
    expect(pending!.consents.map((consent) => consent.purpose)).toEqual([
      "participation",
      "marketing",
    ]);
    // The form offered no contact consent: whatever was posted, none is stored.
    expect(pending!.consents.some((consent) => consent.purpose === "lead_handoff")).toBe(false);

    // Someone else's session, the wrong webinar or a made-up token confirms nothing.
    const stranger = await createUser(dbs.owner.db);
    const base = { slug, token: started.token, userId: learner, email };
    expect(
      await confirmRegistration(dbs.app.db, tenant, {
        ...base,
        userId: stranger,
        email: await emailOf(stranger),
      }),
    ).toEqual({ ok: false, error: "invalid" });
    expect(await confirmRegistration(dbs.app.db, tenant, { ...base, slug: "other" })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(
      await confirmRegistration(dbs.app.db, tenant, { ...base, token: "x".repeat(32) }),
    ).toEqual({ ok: false, error: "invalid" });

    expect(await confirmRegistration(dbs.app.db, tenant, base)).toEqual({
      ok: true,
      status: "registered",
      already: false,
      marketing: true,
      locale: "en",
    });
    // Single use.
    expect(await confirmRegistration(dbs.app.db, tenant, base)).toEqual({
      ok: false,
      error: "invalid",
    });
    const [confirmed] = await registrationsOf(id);
    expect(confirmed).toMatchObject({
      status: "registered",
      userId: learner,
      email: null,
      confirmTokenHash: null,
      entryContext: { utm: { source: "linkedin", medium: "post" } },
    });
    const membership = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(memberships).where(eq(memberships.userId, learner)),
    );
    expect(membership.map((row) => row.role)).toEqual(["learner"]);
    const steps = (await mails(id)).map((row) => row.payload.step);
    expect(steps).toEqual(["confirmation", "reminder_24h", "reminder_1h", "starting", "followup"]);
    const confirmedEvents = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .select()
        .from(events)
        .where(and(eq(events.name, "webinar_confirmed"), eq(events.userId, learner))),
    );
    expect(confirmedEvents).toHaveLength(1);
    expect(confirmedEvents[0]).toMatchObject({
      courseId,
      utm: { source: "linkedin", medium: "post" },
      props: { webinar_id: id, webinar_slug: slug, status: "registered" },
    });
    expect(await viewerRegistration(dbs.app.db, tenant.id, id, learner)).toMatchObject({
      status: "registered",
      attended: false,
      joinUrl: "https://meet.example.com/abc-defg-hij",
    });
  });

  it("stores the consent to be contacted when the form offers it", async () => {
    const { id, slug } = await published();
    const [row] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select({ form: webinars.form }).from(webinars).where(eq(webinars.id, id)),
    );
    await updateWebinarContent(dbs.app.db, tenant.id, id, {
      form: { ...row!.form, consents: { marketing: false, lead_handoff: true } },
    });
    const learner = await createUser(dbs.owner.db);
    await registerSignedIn(dbs.app.db, tenant, {
      slug,
      userId: learner,
      email: await emailOf(learner),
      request: request({ leadHandoff: true, marketing: true }),
      t: t(),
    });
    const stored = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(consents).where(eq(consents.userId, learner)),
    );
    expect(stored).toEqual([
      expect.objectContaining({
        kind: "lead_handoff",
        wording: `${tenant.settings.author_display_name} may contact me about its offers.`,
        confirmedAt: expect.any(Date),
        revokedAt: null,
      }),
    ]);
    const [registration] = await registrationsOf(id);
    expect(registration!.consents.map((consent) => consent.purpose)).toEqual([
      "participation",
      "lead_handoff",
    ]);
  });

  it("puts people on the waitlist when the room is full and moves them up when a seat frees", async () => {
    const { id, slug } = await published({ capacity: 2 });
    const first = await signedInRegistration(slug);
    const second = await signedInRegistration(slug);
    const third = await signedInRegistration(slug);
    const fourth = await signedInRegistration(slug);
    expect([first, second, third, fourth].map((entry) => entry.result)).toMatchObject([
      { ok: true, status: "registered" },
      { ok: true, status: "registered" },
      { ok: true, status: "waitlist" },
      { ok: true, status: "waitlist" },
    ]);
    // Registering again changes nothing.
    expect((await signedInRegistration(slug, third.userId)).result).toMatchObject({
      status: "waitlist",
      already: true,
    });

    const [before] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select({ sequence: webinars.sequence }).from(webinars).where(eq(webinars.id, id)),
    );
    const firstRow = (await registrationsOf(id)).find((row) => row.userId === first.userId)!;
    const cancelled = await cancelRegistration(dbs.app.db, tenant, {
      registrationId: firstRow.id,
      userId: first.userId,
    });
    expect(cancelled).toMatchObject({ ok: true, slug });
    const rows = await registrationsOf(id);
    const status = (userId: string) => rows.find((row) => row.userId === userId)!.status;
    expect(status(first.userId)).toBe("cancelled");
    // Whoever waited longest moves up, the next one keeps waiting.
    expect(status(third.userId)).toBe("registered");
    expect(status(fourth.userId)).toBe("waitlist");
    const thirdRow = rows.find((row) => row.userId === third.userId)!;
    expect(thirdRow.promotedAt).toBeInstanceOf(Date);

    const queued = await mails(id);
    const forThird = queued
      .filter((row) => row.userId === third.userId)
      .map((row) => row.payload.step);
    expect(forThird).toEqual([
      "waitlist",
      "promoted",
      "reminder_24h",
      "reminder_1h",
      "starting",
      "followup",
    ]);
    const forFirst = queued.filter((row) => row.userId === first.userId);
    // The cancelled seat's reminders stay unsent; the cancellation mail removes the calendar entry.
    expect(forFirst.filter((row) => row.status === "pending").map((row) => row.payload)).toEqual([
      expect.objectContaining({ step: "registration_cancelled", hadSeat: true }),
    ]);
    const [after] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select({ sequence: webinars.sequence }).from(webinars).where(eq(webinars.id, id)),
    );
    expect(after!.sequence).toBe(before!.sequence + 1);

    // Someone else cannot cancel it, and a cancelled registration stays cancelled.
    expect(
      await cancelRegistration(dbs.app.db, tenant, {
        registrationId: thirdRow.id,
        userId: fourth.userId,
      }),
    ).toEqual({ ok: false });
    expect(
      await cancelRegistration(dbs.app.db, tenant, {
        registrationId: firstRow.id,
        userId: first.userId,
      }),
    ).toEqual({ ok: false });

    // Back after cancelling: at the end of the queue.
    expect((await signedInRegistration(slug, first.userId)).result).toMatchObject({
      status: "waitlist",
      already: false,
    });
  });

  it("never gives away more seats than there are, however many confirm at once", async () => {
    const { id, slug } = await published({ capacity: 3 });
    const wide: DatabaseHandle = createDatabase(process.env.TEST_DATABASE_URL!, { max: 8 });
    try {
      const people = await Promise.all(Array.from({ length: 12 }, () => createUser(dbs.owner.db)));
      const results = await Promise.all(
        people.map(async (userId) =>
          registerSignedIn(wide.db, tenant, {
            slug,
            userId,
            email: await emailOf(userId),
            request: request(),
            t: t(),
          }),
        ),
      );
      expect(results.every((result) => result.ok)).toBe(true);
      const rows = await registrationsOf(id);
      expect(rows.filter((row) => row.status === "registered")).toHaveLength(3);
      expect(rows.filter((row) => row.status === "waitlist")).toHaveLength(9);
    } finally {
      await wide.pool.end();
    }
  });

  it("plans reminders again when the webinar moves, and tells everyone the new time", async () => {
    const { id, slug } = await published({ capacity: 1 });
    const seated = await signedInRegistration(slug);
    const waiting = await signedInRegistration(slug);
    const moved = new Date(Date.now() + 5 * 24 * HOUR);
    const saved = await updateWebinarSetup(
      dbs.app.db,
      tenant,
      id,
      await setup(id, { startsAt: moved, capacity: 1 }),
    );
    expect(saved).toMatchObject({ ok: true, rescheduled: true, promoted: 0 });
    const queued = await mails(id);
    const skipped = queued.filter((row) => row.status === "skipped");
    expect(new Set(skipped.map((row) => row.payload.step))).toEqual(
      new Set(["reminder_24h", "reminder_1h", "starting", "followup"]),
    );
    expect(skipped.every((row) => row.note === "rescheduled")).toBe(true);
    const pending = queued.filter((row) => row.status === "pending");
    const reminders = pending.filter((row) => row.payload.plannedFor);
    expect(reminders.map((row) => row.payload.step)).toEqual([
      "reminder_24h",
      "reminder_1h",
      "starting",
      "followup",
    ]);
    expect(reminders.every((row) => row.payload.plannedFor === moved.toISOString())).toBe(true);
    expect(reminders[0]!.sendAfter).toEqual(new Date(moved.getTime() - 24 * HOUR));
    const updates = pending.filter((row) => row.payload.step === "rescheduled");
    expect(updates.map((row) => row.userId).sort()).toEqual([seated.userId, waiting.userId].sort());

    // More seats move the waitlist up.
    const grown = await updateWebinarSetup(
      dbs.app.db,
      tenant,
      id,
      await setup(id, { startsAt: moved, capacity: 2 }),
    );
    expect(grown).toMatchObject({ ok: true, rescheduled: false, promoted: 1 });

    // The mails go out: the seat holder's update carries the calendar with a higher SEQUENCE.
    sent.length = 0;
    await makeDue(id);
    await dispatchNotifications(dbs.app.db, tenant, { send, limit: 100 });
    const update = sent.find(
      (mail) =>
        mail.to === `${seated.userId}@learners.test` && mail.subject === "New time: Pricing live",
    );
    expect(update?.calendar?.method).toBe("REQUEST");
    expect(update?.calendar?.content).toContain("SEQUENCE:1");
    expect(update?.calendar?.content).toContain(`UID:webinar-${id}@${tenant.primaryDomain}`);
    // One reminder each, for the new time; the ones planned for the old time stay unsent.
    expect(
      sent
        .filter((mail) => mail.subject === "Tomorrow: Pricing live")
        .map((mail) => mail.to)
        .sort(),
    ).toEqual([`${seated.userId}@learners.test`, `${waiting.userId}@learners.test`].sort());
  });

  it("sends the confirmation with a calendar invite, in the learner's language", async () => {
    const { id, slug } = await published({ title: "Preise live" });
    const learner = await createUser(dbs.owner.db);
    await registerSignedIn(dbs.app.db, tenant, {
      slug,
      userId: learner,
      email: await emailOf(learner),
      request: request({ locale: "de" }),
      t: tenantTranslator(tenant, "de"),
    });
    sent.length = 0;
    await dispatchNotifications(dbs.app.db, tenant, { send, limit: 100 });
    const mail = sent.find((candidate) => candidate.to === `${learner}@learners.test`);
    expect(mail?.subject).toBe("Du bist angemeldet: Preise live");
    expect(mail?.calendar?.method).toBe("REQUEST");
    expect(mail?.calendar?.content).toContain("METHOD:REQUEST");
    expect(mail?.calendar?.content.replace(/\r\n /g, "")).toContain(
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${learner}@learners.test`,
    );
    // The join link is not in it: that comes with the "starting now" mail.
    expect(mail?.text).not.toContain("meet.example.com");
    expect(mail?.calendar?.content).not.toContain("meet.example.com");
    // Every mail can cancel, with a key only for this registration.
    const [registration] = await registrationsOf(id);
    const key = cancelKey(tenant.id, registration!.id);
    expect(mail?.html).toContain(`/webinars/${slug}/cancel?r=${registration!.id}&amp;k=${key}`);
    expect(cancelKeyValid(tenant.id, registration!.id, key)).toBe(true);
    expect(cancelKeyValid(otherTenant, registration!.id, key)).toBe(false);
    // Reminders wait for their time.
    expect(sent.filter((candidate) => candidate.to === mail?.to)).toHaveLength(1);

    // "Starting now" brings the join link.
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .update(notifications)
        .set({ sendAfter: sql`now() - interval '1 second'` })
        .where(
          and(
            eq(notifications.userId, learner),
            sql`${notifications.payload}->>'step' = 'starting'`,
          ),
        ),
    );
    sent.length = 0;
    await dispatchNotifications(dbs.app.db, tenant, { send, limit: 100 });
    expect(sent[0]?.subject).toBe("Es geht los: Preise live");
    expect(sent[0]?.html).toContain("https://meet.example.com/abc-defg-hij");
  });

  it("cancels a webinar: reminders stop, registrants hear it, calendars drop it", async () => {
    const { id, slug } = await published({ capacity: 1 });
    const seated = await signedInRegistration(slug);
    const waiting = await signedInRegistration(slug);
    const visitor = await createUser(dbs.owner.db);
    await startRegistration(dbs.app.db, tenant, {
      slug,
      email: await emailOf(visitor),
      request: request(),
      t: t(),
    });
    expect(await cancelWebinar(dbs.app.db, tenant, id)).toEqual({ ok: true, notified: 2 });
    const rows = await registrationsOf(id);
    // A form nobody confirmed is gone; the rest stay for the record.
    expect(rows.map((row) => row.status).sort()).toEqual(["registered", "waitlist"]);
    const queued = await mails(id);
    expect(queued.filter((row) => row.status === "pending").map((row) => row.payload.step)).toEqual(
      ["cancelled", "cancelled"],
    );
    expect(
      queued
        .filter((row) => row.payload.step.startsWith("reminder"))
        .every((row) => row.status === "skipped"),
    ).toBe(true);
    sent.length = 0;
    await makeDue(id);
    await dispatchNotifications(dbs.app.db, tenant, { send, limit: 100 });
    const toSeated = sent.find((mail) => mail.to === `${seated.userId}@learners.test`);
    const toWaiting = sent.find((mail) => mail.to === `${waiting.userId}@learners.test`);
    expect(toSeated?.subject).toBe("Cancelled: Pricing live");
    expect(toSeated?.calendar?.method).toBe("CANCEL");
    expect(toSeated?.calendar?.content).toContain("STATUS:CANCELLED");
    expect(toSeated?.calendar?.content).toContain("SEQUENCE:1");
    expect(toWaiting?.calendar).toBeUndefined();
    // Nobody can register or cancel any more.
    expect((await signedInRegistration(slug)).result).toEqual({ ok: false, error: "closed" });
  });

  it("takes the check-in code only from shortly before the start until after the end", async () => {
    const { id, slug } = await published({ hours: 2 });
    const learner = (await signedInRegistration(slug)).userId;
    const outsider = await createUser(dbs.owner.db);
    const [row] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(webinars).where(eq(webinars.id, id)),
    );
    const code = row!.checkinCode;
    const at = (minutes: number) => new Date(row!.startsAt.getTime() + minutes * 60_000);
    const attempt = (userId: string, value: string, now: Date) =>
      checkIn(dbs.app.db, tenant, { slug, userId, code: value, now });

    expect(await attempt(learner, code, at(-30))).toBe("closed");
    expect(await attempt(outsider, code, at(5))).toBe("not_registered");
    expect(await attempt(learner, "ZZZZZZ", at(5))).toBe("wrong");
    expect(await attempt(learner, code.toLowerCase(), at(5))).toBe("done");
    expect(await attempt(learner, code, at(6))).toBe("already");
    expect(await attempt(learner, code, at(95))).toBe("closed");
    const attendance = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(webinarAttendance).where(eq(webinarAttendance.webinarId, id)),
    );
    expect(attendance).toEqual([
      expect.objectContaining({ userId: learner, source: "checkin_code", joinedAt: at(5) }),
    ]);
    const attended = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .select()
        .from(events)
        .where(and(eq(events.name, "webinar_attended"), eq(events.userId, learner))),
    );
    expect(attended).toHaveLength(1);
  });

  it("imports attendance from a tool's file, matching registrants by address", async () => {
    const { id, slug } = await published();
    const ada = (await signedInRegistration(slug)).userId;
    const grace = await createUser(dbs.owner.db);
    await registerSignedIn(dbs.app.db, tenant, {
      slug,
      userId: grace,
      email: await emailOf(grace),
      request: request({ leadHandoff: true }),
      t: t(),
    });
    // Grace agreed to be contacted (the form above offered no consent, so do it the usual way).
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.insert(consents).values({
        tenantId: tenant.id,
        userId: grace,
        kind: "lead_handoff",
        wording: "may contact me",
        confirmedAt: new Date(),
      }),
    );
    const csv = [
      "Name (Original Name),User Email,Join Time,Leave Time,Duration (Minutes)",
      `Ada,${(await emailOf(ada)).toUpperCase()},10/06/2026 06:00:00 PM,10/06/2026 06:40:00 PM,40`,
      `Grace,${await emailOf(grace)},10/06/2026 06:00:00 PM,10/06/2026 07:00:00 PM,60`,
      "Guest,guest@elsewhere.example,10/06/2026 06:00:00 PM,10/06/2026 06:05:00 PM,5",
    ].join("\n");
    const parse = parseAttendanceCsv(csv, { timeZone: "Europe/Berlin" });
    const preview = await previewAttendance(dbs.app.db, tenant.id, id, parse);
    expect(preview.format).toBe("zoom");
    expect(preview.matched).toEqual([
      expect.objectContaining({
        alias: learnerAlias(tenant.id, ada),
        email: null,
        durationMinutes: 40,
        already: false,
      }),
      expect.objectContaining({
        alias: learnerAlias(tenant.id, grace),
        email: await emailOf(grace),
        durationMinutes: 60,
      }),
    ]);
    expect(preview.unmatched).toEqual([{ line: 4, email: "guest@elsewhere.example" }]);
    // Nothing is saved by looking.
    const none = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(webinarAttendance).where(eq(webinarAttendance.webinarId, id)),
    );
    expect(none).toEqual([]);

    expect(await importAttendance(dbs.app.db, tenant, id, parse)).toEqual({
      added: 2,
      updated: 0,
      unmatched: 1,
    });
    expect(await importAttendance(dbs.app.db, tenant, id, parse)).toEqual({
      added: 0,
      updated: 2,
      unmatched: 1,
    });
    const rows = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(webinarAttendance).where(eq(webinarAttendance.webinarId, id)),
    );
    expect(rows.map((row) => [row.userId, row.source, row.durationMinutes]).sort()).toEqual(
      [
        [ada, "tool_report", 40],
        [grace, "tool_report", 60],
      ].sort(),
    );

    // The Studio's list: aliases, contact details only with consent.
    const registrants = await listRegistrants(dbs.app.db, tenant.id, id);
    expect(
      registrants.map((row) => [
        row.alias,
        row.contact?.email ?? null,
        row.attendance?.durationMinutes,
      ]),
    ).toEqual([
      [learnerAlias(tenant.id, ada), null, 40],
      [learnerAlias(tenant.id, grace), await emailOf(grace), 60],
    ]);
  });

  it("shows questions for the host as an anonymous digest, and choices as counts", async () => {
    const { id, slug } = await published();
    const [row] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select({ form: webinars.form }).from(webinars).where(eq(webinars.id, id)),
    );
    const saved = await updateWebinarContent(dbs.app.db, tenant.id, id, {
      form: registrationFormSchema.parse({
        ...row!.form,
        fields: [
          {
            id: "size",
            kind: "select",
            label: "Team size",
            options: ["1-10", "11-50"],
            required: true,
          },
          { id: "question", kind: "textarea", label: "Your question" },
        ],
      }),
    });
    expect(saved.ok).toBe(true);
    for (const [size, question] of [
      ["1-10", "How do I price a pilot?"],
      ["11-50", ""],
      ["1-10", "Annual or monthly?"],
    ] as const) {
      const userId = await createUser(dbs.owner.db);
      const result = await registerSignedIn(dbs.app.db, tenant, {
        slug,
        userId,
        email: await emailOf(userId),
        request: request({ answers: { name: "X", size, question } }),
        t: t(),
      });
      expect(result.ok).toBe(true);
    }
    const missing = await signedInRegistration(slug);
    expect(missing.result).toEqual({
      ok: false,
      error: "answers",
      issues: [{ field: "size", code: "required" }],
    });
    expect(await registrationDigest(dbs.app.db, tenant.id, id)).toEqual({
      questions: [
        {
          fieldId: "question",
          label: "Your question",
          answers: ["Annual or monthly?", "How do I price a pilot?"],
        },
      ],
      choices: [
        {
          fieldId: "size",
          label: "Team size",
          counts: [
            { option: "1-10", n: 2 },
            { option: "11-50", n: 1 },
          ],
        },
      ],
    });
  });

  it("counts the funnel from page views to the course", async () => {
    const { id, slug } = await published();
    const { recordWebinarView } = await import("@/server/webinars/public");
    for (let i = 0; i < 3; i++) {
      await recordWebinarView(
        dbs.app.db,
        tenant.id,
        { id, slug, courseId },
        { locale: "en", entry: {} },
      );
    }
    const learner = (await signedInRegistration(slug)).userId;
    const visitor = await createUser(dbs.owner.db);
    await startRegistration(dbs.app.db, tenant, {
      slug,
      email: await emailOf(visitor),
      request: request(),
      t: t(),
    });
    await withTenant(dbs.app.db, tenant.id, async (tx) => {
      await tx.insert(events).values([
        { tenantId: tenant.id, name: "course_started", userId: learner, courseId },
        // Before they registered: the webinar did not bring them there.
        {
          tenantId: tenant.id,
          name: "course_completed",
          userId: learner,
          courseId,
          occurredAt: new Date(Date.now() - 10 * 24 * HOUR),
        },
      ]);
    });
    expect(await webinarFunnel(dbs.app.db, tenant.id, id)).toEqual([
      { step: "views", count: 3 },
      { step: "registrations", count: 2 },
      { step: "confirmed", count: 1 },
      { step: "attended", count: 0 },
      { step: "course_started", count: 1 },
      { step: "course_submitted", count: 0 },
      { step: "course_passed", count: 0 },
    ]);
  });

  it("forgets forms nobody confirmed after a day", async () => {
    const { id, slug } = await published();
    const visitor = await createUser(dbs.owner.db);
    await startRegistration(dbs.app.db, tenant, {
      slug,
      email: await emailOf(visitor),
      request: request(),
      t: t(),
    });
    expect(
      await expirePendingRegistrations(dbs.app.db, tenant.id, new Date(Date.now() + HOUR)),
    ).toBe(0);
    expect(
      await expirePendingRegistrations(dbs.app.db, tenant.id, new Date(Date.now() + 25 * HOUR)),
    ).toBeGreaterThanOrEqual(1);
    expect(await registrationsOf(id)).toEqual([]);
  });

  it("hands learners their webinar data, and deletes it with the seat going to the next person", async () => {
    const { id, slug } = await published({ capacity: 1 });
    const leaving = (await signedInRegistration(slug)).userId;
    const next = (await signedInRegistration(slug)).userId;
    // Also in another academy, so the account itself stays.
    await withTenant(dbs.owner.db, otherTenant, (tx) =>
      tx.insert(memberships).values({ tenantId: otherTenant, userId: leaving, role: "learner" }),
    );
    expect((await myWebinars(dbs.app.db, tenant.id, leaving)).map((row) => row.status)).toEqual([
      "registered",
    ]);
    const exported = await exportMyData(dbs.app.db, tenant, leaving);
    expect(exported.webinarRegistrations).toEqual([
      expect.objectContaining({ webinar: slug, status: "registered", answers: { name: "Ada" } }),
    ]);
    expect(exported.webinarAttendance).toEqual([]);

    await deleteMyData(dbs.app.db, tenant, leaving);
    const rows = await registrationsOf(id);
    expect(rows.map((row) => [row.userId, row.status])).toEqual([[next, "registered"]]);
  });

  it("puts the webinar tables into the academy's export", async () => {
    await published();
    const target = join(tmpdir(), `academy-${tenant.id}-webinars.zip`);
    await exportAcademy(dbs.owner.db, tenant.id, target, { withFiles: false });
    const zip = unzipSync(readFileSync(target));
    const json = (name: string) => JSON.parse(strFromU8(zip[name]!)) as unknown[];
    expect(json("data/webinars.json").length).toBeGreaterThan(0);
    expect(json("data/webinar_registrations.json").length).toBeGreaterThan(0);
    expect(json("data/webinar_attendance.json").length).toBeGreaterThan(0);
  });
});
