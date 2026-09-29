import { createHash, randomBytes } from "node:crypto";

import { and, eq, lt, sql } from "drizzle-orm";

import type { EntryContext } from "@/core/entry/context";
import type { Locale } from "@/core/i18n/locales";
import type { Translator } from "@/core/i18n/translator";
import type { TenantContext } from "@/core/tenant/context";
import { seatFor, toPromote, type Seat } from "@/core/webinars/capacity";
import { CHECKIN_ATTEMPTS, checkinCodeMatches } from "@/core/webinars/checkin";
import { validateAnswers, type AnswerIssue } from "@/core/webinars/landing";
import {
  checkinOpen,
  pendingExpiresAt,
  registrationOpen,
  webinarPhase,
} from "@/core/webinars/phase";
import { givenConsents, type GivenConsent } from "@/core/webinars/registration";
import type { Database, Transaction } from "@/db/client";
import { webinarAttendance, webinarRegistrations, webinars } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { applyContactOptIn } from "@/server/consent";
import { trackEvent } from "@/server/events";
import { ensureLearner } from "@/server/learners";
import { rateLimit } from "@/server/rate-limit";
import { planReminders, queueWebinarMail, skipWebinarMails } from "@/server/webinars/mail";
import { reliveOf } from "@/server/webinars/recording";

/*
 * Registering for a webinar (webinar brief §2.2: registration = learner
 * account). A signed-in learner registers with one click. Anyone else sends
 * the form and gets one mail with a magic link: the click proves the
 * address, signs them in and confirms the registration, with a seat or a
 * place on the waitlist. Seats are decided with the webinar's row locked,
 * so two confirmations never take the last seat twice. After the end,
 * registering is for the recording (webinar brief §3, evergreen pages): no
 * seats to fill, no reminders, a confirmation that brings the recording.
 */

type WebinarRow = typeof webinars.$inferSelect;
type RegistrationRow = typeof webinarRegistrations.$inferSelect;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export interface RegistrationRequest {
  /** Name and custom fields as typed, by field id ("name" for the name). */
  answers: Record<string, string>;
  marketing: boolean;
  leadHandoff: boolean;
  locale: Locale;
  entry: EntryContext;
}

export type RegistrationError = "not_found" | "closed";

export type StartResult =
  | { ok: true; registrationId: string; token: string }
  | { ok: false; error: RegistrationError }
  | { ok: false; error: "answers"; issues: AnswerIssue[] };

export type SeatResult =
  | { ok: true; status: Seat; already: boolean; marketing: boolean; locale: string }
  | { ok: false; error: RegistrationError | "invalid" }
  | { ok: false; error: "answers"; issues: AnswerIssue[] };

/** The wording the form showed, per purpose, in the viewer's language. */
export function registrationConsents(
  tenant: TenantContext,
  webinar: Pick<
    WebinarRow,
    "title" | "recorded" | "recordingNotice" | "form" | "startsAt" | "durationMinutes"
  >,
  t: Translator,
  choices: { marketing: boolean; leadHandoff: boolean },
  now: Date,
): GivenConsent[] {
  const academy = tenant.settings.author_display_name;
  // After the end the form was for the recording, as it said (components/webinars/form-fields).
  const forRecording = webinarPhase(webinar, now) === "ended";
  return givenConsents(
    {
      participation: t.t(
        forRecording ? "webinar.form.participationRecording" : "webinar.form.participation",
        { title: webinar.title, academy },
      ),
      recording:
        webinar.recorded && !forRecording
          ? (webinar.recordingNotice ?? t.t("webinar.form.recording", { academy }))
          : null,
      // Only what the form offered counts, whatever was posted.
      marketing:
        choices.marketing && webinar.form.consents.marketing
          ? t.t("me.newsLabel", { academy })
          : null,
      leadHandoff:
        choices.leadHandoff && webinar.form.consents.lead_handoff
          ? t.t("me.contactLabel", { academy })
          : null,
    },
    now,
  );
}

function eventProps(webinar: Pick<WebinarRow, "id" | "slug">, extra: Record<string, unknown> = {}) {
  return { webinar_id: webinar.id, webinar_slug: webinar.slug, ...extra };
}

/** Locks the webinar: every seat decision for it waits here, one after another. */
async function lockWebinar(tx: Transaction, webinarId: string): Promise<WebinarRow | undefined> {
  const [row] = await tx.select().from(webinars).where(eq(webinars.id, webinarId)).for("update");
  return row;
}

/** Whether the webinar takes registrations now: until its end, then for its recording. */
async function openNow(tx: Transaction, webinar: WebinarRow, now: Date): Promise<boolean> {
  if (registrationOpen(webinar, now)) return true;
  return registrationOpen(webinar, now, await reliveOf(tx, webinar, now));
}

/** A seat or the waitlist; after the end there is no room to fill, the recording has space for all. */
async function seatNow(tx: Transaction, webinar: WebinarRow, now: Date): Promise<Seat> {
  if (webinarPhase(webinar, now) === "ended") return "registered";
  return seatFor(webinar.capacity, await seatsTaken(tx, webinar.id));
}

export async function seatsTaken(tx: Transaction, webinarId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(webinarRegistrations)
    .where(
      and(
        eq(webinarRegistrations.webinarId, webinarId),
        eq(webinarRegistrations.status, "registered"),
      ),
    );
  return row?.n ?? 0;
}

/**
 * The form was sent by someone not signed in: a pending registration with
 * their answers and the consents shown, and a token for the magic link's
 * way back. It holds no seat. Sending the form again replaces it.
 */
export async function startRegistration(
  db: Database,
  tenant: TenantContext,
  input: { slug: string; email: string; request: RegistrationRequest; t: Translator; now?: Date },
): Promise<StartResult> {
  const now = input.now ?? new Date();
  const email = input.email.trim().toLowerCase();
  return withTenant(db, tenant.id, async (tx) => {
    const [webinar] = await tx.select().from(webinars).where(eq(webinars.slug, input.slug));
    if (!webinar || webinar.status === "draft") return { ok: false, error: "not_found" } as const;
    if (!(await openNow(tx, webinar, now))) return { ok: false, error: "closed" } as const;
    const checked = validateAnswers(webinar.form, input.request.answers);
    if (!checked.ok) return { ok: false, error: "answers", issues: checked.issues } as const;

    const token = randomBytes(24).toString("base64url");
    const values = {
      answers: checked.answers,
      consents: registrationConsents(tenant, webinar, input.t, input.request, now),
      entryContext: input.request.entry,
      locale: input.request.locale,
      confirmTokenHash: hashToken(token),
      expiresAt: pendingExpiresAt(now),
    };
    const [row] = await tx
      .insert(webinarRegistrations)
      .values({ tenantId: tenant.id, webinarId: webinar.id, email, status: "pending", ...values })
      .onConflictDoUpdate({
        target: [
          webinarRegistrations.tenantId,
          webinarRegistrations.webinarId,
          webinarRegistrations.email,
        ],
        targetWhere: sql`${webinarRegistrations.email} is not null`,
        set: values,
      })
      .returning({ id: webinarRegistrations.id });
    await trackEvent(tx, {
      tenantId: tenant.id,
      name: "webinar_registered",
      courseId: webinar.courseId,
      locale: input.request.locale,
      entry: input.request.entry,
      props: eventProps(webinar),
    });
    return { ok: true, registrationId: row!.id, token } as const;
  });
}

/** What follows a confirmed registration, in its transaction: mail, reminders, consent, the event. */
async function afterConfirmed(
  tx: Transaction,
  tenant: TenantContext,
  webinar: WebinarRow,
  registration: Pick<RegistrationRow, "id" | "consents" | "entryContext" | "locale"> & {
    userId: string;
    status: Seat;
  },
  now: Date,
): Promise<void> {
  if (webinarPhase(webinar, now) === "ended") {
    // For the recording: no calendar, no reminders. Ready now, the confirmation brings it;
    // still being prepared, it follows by mail when ready (server/webinars/relive-mail.ts).
    const ready = (await reliveOf(tx, webinar, now)) === "ready";
    await queueWebinarMail(tx, tenant.id, {
      userId: registration.userId,
      webinarId: webinar.id,
      registrationId: registration.id,
      step: "relive_confirmation",
      recording: ready,
    });
    if (ready) {
      await tx
        .update(webinarRegistrations)
        .set({ reliveMailedAt: now })
        .where(eq(webinarRegistrations.id, registration.id));
    }
  } else {
    await queueWebinarMail(tx, tenant.id, {
      userId: registration.userId,
      webinarId: webinar.id,
      registrationId: registration.id,
      step: registration.status === "registered" ? "confirmation" : "waitlist",
    });
    if (registration.status === "registered") {
      await planReminders(tx, tenant.id, webinar, registration, now);
    }
  }
  const handoff = registration.consents.find((consent) => consent.purpose === "lead_handoff");
  if (handoff) await applyContactOptIn(tx, tenant.id, registration.userId, true, handoff.wording);
  await trackEvent(tx, {
    tenantId: tenant.id,
    name: "webinar_confirmed",
    userId: registration.userId,
    courseId: webinar.courseId,
    locale: registration.locale,
    entry: registration.entryContext,
    props: eventProps(webinar, { status: registration.status }),
  });
}

/**
 * The magic link came back: the viewer's address is the one the form was
 * sent with, so the pending registration becomes theirs, with a seat or a
 * place on the waitlist. Someone already registered keeps what they have.
 */
export async function confirmRegistration(
  db: Database,
  tenant: TenantContext,
  input: { slug: string; token: string; userId: string; email: string; now?: Date },
): Promise<SeatResult> {
  const now = input.now ?? new Date();
  return withTenant(db, tenant.id, async (tx) => {
    const [found] = await tx
      .select({ registration: webinarRegistrations, slug: webinars.slug })
      .from(webinarRegistrations)
      .innerJoin(webinars, eq(webinars.id, webinarRegistrations.webinarId))
      .where(
        and(
          eq(webinarRegistrations.confirmTokenHash, hashToken(input.token)),
          eq(webinarRegistrations.status, "pending"),
        ),
      );
    const pending = found?.registration;
    if (
      !pending ||
      found.slug !== input.slug ||
      !pending.expiresAt ||
      pending.expiresAt <= now ||
      pending.email !== input.email.trim().toLowerCase()
    ) {
      return { ok: false, error: "invalid" } as const;
    }
    const webinar = await lockWebinar(tx, pending.webinarId);
    if (!webinar || !(await openNow(tx, webinar, now))) {
      await tx.delete(webinarRegistrations).where(eq(webinarRegistrations.id, pending.id));
      return { ok: false, error: "closed" } as const;
    }
    const marketing = pending.consents.some((consent) => consent.purpose === "marketing");
    await ensureLearner(tx, tenant, input.userId, {
      locale: pending.locale as Locale,
      entry: pending.entryContext,
    });

    const [existing] = await tx
      .select()
      .from(webinarRegistrations)
      .where(
        and(
          eq(webinarRegistrations.webinarId, webinar.id),
          eq(webinarRegistrations.userId, input.userId),
        ),
      )
      .for("update");
    if (existing && existing.status !== "cancelled") {
      await tx.delete(webinarRegistrations).where(eq(webinarRegistrations.id, pending.id));
      return {
        ok: true,
        status: existing.status as Seat,
        already: true,
        marketing,
        locale: pending.locale,
      } as const;
    }

    const status = await seatNow(tx, webinar, now);
    const confirmed = {
      status,
      answers: pending.answers,
      consents: pending.consents,
      entryContext: pending.entryContext,
      locale: pending.locale,
      confirmedAt: now,
      cancelledAt: null,
      promotedAt: null,
    };
    let registrationId = pending.id;
    if (existing) {
      // Back after cancelling: the same row, at the end of any queue.
      await tx.delete(webinarRegistrations).where(eq(webinarRegistrations.id, pending.id));
      await tx
        .update(webinarRegistrations)
        .set(confirmed)
        .where(eq(webinarRegistrations.id, existing.id));
      registrationId = existing.id;
    } else {
      await tx
        .update(webinarRegistrations)
        .set({
          ...confirmed,
          userId: input.userId,
          email: null,
          confirmTokenHash: null,
          expiresAt: null,
        })
        .where(eq(webinarRegistrations.id, pending.id));
    }
    await afterConfirmed(
      tx,
      tenant,
      webinar,
      { ...confirmed, id: registrationId, userId: input.userId },
      now,
    );
    return { ok: true, status, already: false, marketing, locale: pending.locale } as const;
  });
}

/** One click for a signed-in learner: their address is proven already. */
export async function registerSignedIn(
  db: Database,
  tenant: TenantContext,
  input: {
    slug: string;
    userId: string;
    email: string;
    request: RegistrationRequest;
    t: Translator;
    now?: Date;
  },
): Promise<SeatResult> {
  const now = input.now ?? new Date();
  return withTenant(db, tenant.id, async (tx) => {
    const [found] = await tx
      .select({ id: webinars.id })
      .from(webinars)
      .where(eq(webinars.slug, input.slug));
    const webinar = found ? await lockWebinar(tx, found.id) : undefined;
    if (!webinar || webinar.status === "draft") return { ok: false, error: "not_found" } as const;
    if (!(await openNow(tx, webinar, now))) return { ok: false, error: "closed" } as const;
    const checked = validateAnswers(webinar.form, input.request.answers);
    if (!checked.ok) return { ok: false, error: "answers", issues: checked.issues } as const;
    const consents = registrationConsents(tenant, webinar, input.t, input.request, now);
    const marketing = consents.some((consent) => consent.purpose === "marketing");

    const [existing] = await tx
      .select()
      .from(webinarRegistrations)
      .where(
        and(
          eq(webinarRegistrations.webinarId, webinar.id),
          eq(webinarRegistrations.userId, input.userId),
        ),
      );
    if (existing && existing.status !== "cancelled") {
      return {
        ok: true,
        status: existing.status as Seat,
        already: true,
        marketing: false,
        locale: existing.locale,
      } as const;
    }
    await ensureLearner(tx, tenant, input.userId, {
      locale: input.request.locale,
      entry: input.request.entry,
    });
    // A form sent earlier from another device is done with.
    await tx
      .delete(webinarRegistrations)
      .where(
        and(
          eq(webinarRegistrations.webinarId, webinar.id),
          eq(webinarRegistrations.email, input.email.trim().toLowerCase()),
        ),
      );
    await trackEvent(tx, {
      tenantId: tenant.id,
      name: "webinar_registered",
      userId: input.userId,
      courseId: webinar.courseId,
      locale: input.request.locale,
      entry: input.request.entry,
      props: eventProps(webinar),
    });

    const status = await seatNow(tx, webinar, now);
    const values = {
      status,
      answers: checked.answers,
      consents,
      entryContext: input.request.entry,
      locale: input.request.locale,
      confirmedAt: now,
      cancelledAt: null,
      promotedAt: null,
    };
    const [row] = existing
      ? await tx
          .update(webinarRegistrations)
          .set(values)
          .where(eq(webinarRegistrations.id, existing.id))
          .returning({ id: webinarRegistrations.id })
      : await tx
          .insert(webinarRegistrations)
          .values({ tenantId: tenant.id, webinarId: webinar.id, userId: input.userId, ...values })
          .returning({ id: webinarRegistrations.id });
    await afterConfirmed(
      tx,
      tenant,
      webinar,
      { ...values, id: row!.id, userId: input.userId },
      now,
    );
    return {
      ok: true,
      status,
      already: false,
      marketing,
      locale: input.request.locale,
    } as const;
  });
}

/**
 * Freed seats go to the waitlist in order, each with a mail and the
 * reminders still ahead. Call with the webinar locked.
 */
export async function promoteWaitlist(
  tx: Transaction,
  tenant: TenantContext,
  webinar: WebinarRow,
  now: Date,
): Promise<string[]> {
  if (webinar.status !== "published" || webinarPhase(webinar, now) === "ended") return [];
  const waiting = await tx
    .select({
      id: webinarRegistrations.id,
      userId: webinarRegistrations.userId,
      confirmedAt: webinarRegistrations.confirmedAt,
      createdAt: webinarRegistrations.createdAt,
      locale: webinarRegistrations.locale,
      entryContext: webinarRegistrations.entryContext,
    })
    .from(webinarRegistrations)
    .where(
      and(
        eq(webinarRegistrations.webinarId, webinar.id),
        eq(webinarRegistrations.status, "waitlist"),
      ),
    );
  const promoted = toPromote(
    webinar.capacity,
    await seatsTaken(tx, webinar.id),
    waiting.map((row) => ({ ...row, queuedAt: row.confirmedAt ?? row.createdAt })),
  );
  for (const row of promoted) {
    await tx
      .update(webinarRegistrations)
      .set({ status: "registered", promotedAt: now })
      .where(eq(webinarRegistrations.id, row.id));
    const registration = { id: row.id, userId: row.userId! };
    await queueWebinarMail(tx, tenant.id, {
      ...registration,
      webinarId: webinar.id,
      registrationId: row.id,
      step: "promoted",
    });
    await planReminders(tx, tenant.id, webinar, registration, now);
    await trackEvent(tx, {
      tenantId: tenant.id,
      name: "webinar_confirmed",
      userId: row.userId,
      courseId: webinar.courseId,
      locale: row.locale,
      entry: row.entryContext,
      props: eventProps(webinar, { status: "registered", promoted: true }),
    });
  }
  return promoted.map((row) => row.id);
}

/**
 * Cancelling one's registration (on the page, in "My learning" or from the
 * link in every mail): the seat goes to the next on the waitlist at once.
 * `userId` limits it to the viewer's own registration.
 */
export async function cancelRegistration(
  db: Database,
  tenant: TenantContext,
  input: { registrationId: string; userId?: string; now?: Date },
): Promise<{ ok: true; slug: string; promoted: string[] } | { ok: false }> {
  const now = input.now ?? new Date();
  return withTenant(db, tenant.id, async (tx) => {
    const [found] = await tx
      .select({ webinarId: webinarRegistrations.webinarId })
      .from(webinarRegistrations)
      .where(eq(webinarRegistrations.id, input.registrationId));
    const webinar = found ? await lockWebinar(tx, found.webinarId) : undefined;
    if (!webinar) return { ok: false } as const;
    const [registration] = await tx
      .select()
      .from(webinarRegistrations)
      .where(eq(webinarRegistrations.id, input.registrationId))
      .for("update");
    if (
      !registration?.userId ||
      (input.userId && registration.userId !== input.userId) ||
      (registration.status !== "registered" && registration.status !== "waitlist") ||
      webinar.status !== "published" ||
      webinarPhase(webinar, now) === "ended"
    ) {
      return { ok: false } as const;
    }
    const hadSeat = registration.status === "registered";
    await tx
      .update(webinarRegistrations)
      .set({ status: "cancelled", cancelledAt: now })
      .where(eq(webinarRegistrations.id, registration.id));
    await skipWebinarMails(
      tx,
      { webinarId: webinar.id, registrationId: registration.id },
      "cancelled",
    );
    // A cancellation for their calendar must outrank the invitation it had.
    const [bumped] = hadSeat
      ? await tx
          .update(webinars)
          .set({ sequence: sql`${webinars.sequence} + 1` })
          .where(eq(webinars.id, webinar.id))
          .returning()
      : [webinar];
    await queueWebinarMail(tx, tenant.id, {
      userId: registration.userId,
      webinarId: webinar.id,
      registrationId: registration.id,
      step: "registration_cancelled",
      hadSeat,
    });
    await trackEvent(tx, {
      tenantId: tenant.id,
      name: "webinar_registration_cancelled",
      userId: registration.userId,
      courseId: webinar.courseId,
      locale: registration.locale,
      props: eventProps(webinar, { had_seat: hadSeat }),
    });
    const promoted = hadSeat ? await promoteWaitlist(tx, tenant, bumped ?? webinar, now) : [];
    return { ok: true, slug: webinar.slug, promoted } as const;
  });
}

export type CheckInResult = "done" | "already" | "wrong" | "closed" | "not_registered" | "too_many";

/** The code the host shows during the session, entered by a registrant with a seat. */
export async function checkIn(
  db: Database,
  tenant: TenantContext,
  input: { slug: string; userId: string; code: string; now?: Date },
): Promise<CheckInResult> {
  const now = input.now ?? new Date();
  return withTenant(db, tenant.id, async (tx) => {
    const [webinar] = await tx.select().from(webinars).where(eq(webinars.slug, input.slug));
    if (!webinar || webinar.status !== "published" || !checkinOpen(webinar, now)) return "closed";
    const [registration] = await tx
      .select()
      .from(webinarRegistrations)
      .where(
        and(
          eq(webinarRegistrations.webinarId, webinar.id),
          eq(webinarRegistrations.userId, input.userId),
          eq(webinarRegistrations.status, "registered"),
        ),
      );
    if (!registration) return "not_registered";
    if (
      !rateLimit(
        `checkin:${tenant.id}:${webinar.id}:${input.userId}`,
        CHECKIN_ATTEMPTS.max,
        CHECKIN_ATTEMPTS.windowMs,
        now.getTime(),
      )
    ) {
      return "too_many";
    }
    if (!checkinCodeMatches(webinar.checkinCode, input.code)) return "wrong";
    const recorded = await recordAttendance(tx, tenant, webinar, {
      userId: input.userId,
      source: "checkin_code",
      joinedAt: now,
      leftAt: null,
      durationMinutes: null,
      locale: registration.locale,
    });
    return recorded ? "done" : "already";
  });
}

/**
 * Stores someone's attendance; a later file or report fills in times and
 * duration. True when they had none before (that is when the event fires).
 */
export async function recordAttendance(
  tx: Transaction,
  tenant: TenantContext,
  webinar: Pick<WebinarRow, "id" | "slug" | "courseId">,
  row: {
    userId: string;
    source: "checkin_code" | "manual" | "tool_report";
    joinedAt: Date | null;
    leftAt: Date | null;
    durationMinutes: number | null;
    locale?: string | null;
  },
): Promise<boolean> {
  const [before] = await tx
    .select()
    .from(webinarAttendance)
    .where(
      and(eq(webinarAttendance.webinarId, webinar.id), eq(webinarAttendance.userId, row.userId)),
    )
    .for("update");
  if (before) {
    // A check-in stays a check-in; a report adds what it knows.
    await tx
      .update(webinarAttendance)
      .set({
        joinedAt:
          row.joinedAt && (!before.joinedAt || row.joinedAt < before.joinedAt)
            ? row.joinedAt
            : before.joinedAt,
        leftAt: row.leftAt ?? before.leftAt,
        durationMinutes: row.durationMinutes ?? before.durationMinutes,
      })
      .where(eq(webinarAttendance.id, before.id));
    return false;
  }
  await tx.insert(webinarAttendance).values({
    tenantId: tenant.id,
    webinarId: webinar.id,
    userId: row.userId,
    source: row.source,
    joinedAt: row.joinedAt,
    leftAt: row.leftAt,
    durationMinutes: row.durationMinutes,
  });
  await trackEvent(tx, {
    tenantId: tenant.id,
    name: "webinar_attended",
    userId: row.userId,
    courseId: webinar.courseId,
    locale: row.locale ?? null,
    props: eventProps(webinar, {
      source: row.source,
      ...(row.durationMinutes !== null ? { duration_minutes: row.durationMinutes } : {}),
    }),
  });
  return true;
}

/** Pending registrations whose link was never clicked hold personal data for nothing. */
export async function expirePendingRegistrations(
  db: Database,
  tenantId: string,
  now: Date = new Date(),
): Promise<number> {
  const removed = await withTenant(db, tenantId, (tx) =>
    tx
      .delete(webinarRegistrations)
      .where(
        and(eq(webinarRegistrations.status, "pending"), lt(webinarRegistrations.expiresAt, now)),
      )
      .returning({ id: webinarRegistrations.id }),
  );
  return removed.length;
}
