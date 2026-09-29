import { randomBytes } from "node:crypto";

import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";

import type { WordingFinding } from "@/core/compliance/wording-lint";
import { hasBlockingWording } from "@/core/compliance/wording-lint";
import type { LocalizedText } from "@/core/i18n/locales";
import { learnerAlias } from "@/core/people/alias";
import { slugify } from "@/core/shared/slug";
import type { TenantContext } from "@/core/tenant/context";
import type { AttendanceParse } from "@/core/webinars/attendance-csv";
import { generateCheckinCode } from "@/core/webinars/checkin";
import {
  DEFAULT_LANDING_BLOCKS,
  DEFAULT_REGISTRATION_FORM,
  lintWebinarContent,
  type LandingBlock,
  type Presenter,
  type RegistrationForm,
} from "@/core/webinars/landing";
import { webinarEnd, webinarPhase } from "@/core/webinars/phase";
import { WEBINAR_FUNNEL_STEPS, type WebinarFunnelStep } from "@/core/webinars/registration";
import { REMINDER_STEPS } from "@/core/webinars/reminders";
import {
  webinarPublishIssues,
  type WebinarPublishIssue,
  type WebinarSetup,
} from "@/core/webinars/setup";
import { toolAdapter } from "@/core/webinars/tools";
import type { Database, Transaction } from "@/db/client";
import {
  consents,
  courses,
  events,
  learnerProfiles,
  user,
  webinarAttendance,
  webinarRegistrations,
  webinars,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { planReminders, queueWebinarMail, skipWebinarMails } from "@/server/webinars/mail";
import { promoteWaitlist, recordAttendance } from "@/server/webinars/registration";

/*
 * Webinars in the Studio (webinar brief §2.2, §3): set one up, build its
 * page and form, publish, move or cancel it (registrants hear about both),
 * and see who registered and who came. Learners appear by alias; names,
 * addresses and answers only for those who agreed to be contacted.
 */

export type WebinarRow = typeof webinars.$inferSelect;

const n = sql<number>`count(*)::int`;

async function uniqueSlug(tx: Transaction, base: string): Promise<string> {
  const root = (base || "webinar").slice(0, 56);
  const taken = new Set(
    (
      await tx
        .select({ slug: webinars.slug })
        .from(webinars)
        .where(sql`${webinars.slug} like ${`${root}%`}`)
    ).map((row) => row.slug),
  );
  let slug = root;
  for (let i = 2; taken.has(slug); i++) slug = `${root}-${i}`;
  return slug;
}

export function newCheckinCode(): string {
  return generateCheckinCode((size) => randomBytes(size));
}

/** A new draft with the essentials; its page and form start from the defaults. */
export async function createWebinar(
  db: Database,
  tenantId: string,
  input: Pick<WebinarSetup, "title" | "locale" | "startsAt" | "timeZone" | "durationMinutes"> & {
    createdBy: string;
  },
): Promise<string> {
  return withTenant(db, tenantId, async (tx) => {
    const [row] = await tx
      .insert(webinars)
      .values({
        tenantId,
        slug: await uniqueSlug(tx, slugify(input.title)),
        locale: input.locale,
        title: input.title,
        startsAt: input.startsAt,
        timeZone: input.timeZone,
        durationMinutes: input.durationMinutes,
        blocks: DEFAULT_LANDING_BLOCKS,
        form: DEFAULT_REGISTRATION_FORM,
        checkinCode: newCheckinCode(),
        createdBy: input.createdBy,
      })
      .returning({ id: webinars.id });
    return row!.id;
  });
}

export type SetupError =
  "not_found" | "cancelled" | "slug_taken" | "slug_locked" | "course" | "ended";

/**
 * Saves the setup. A published webinar that moves gets a new calendar
 * SEQUENCE, its reminders are planned again from the new time, and everyone
 * registered hears about it; more seats move the waitlist up.
 */
export async function updateWebinarSetup(
  db: Database,
  tenant: TenantContext,
  webinarId: string,
  setup: WebinarSetup,
  now: Date = new Date(),
): Promise<
  | { ok: true; rescheduled: boolean; promoted: number; findings: WordingFinding[] }
  | { ok: false; error: SetupError }
  | { ok: false; error: "wording"; findings: WordingFinding[] }
> {
  return withTenant(db, tenant.id, async (tx) => {
    const [webinar] = await tx
      .select()
      .from(webinars)
      .where(eq(webinars.id, webinarId))
      .for("update");
    if (!webinar) return { ok: false, error: "not_found" } as const;
    if (webinar.status === "cancelled") return { ok: false, error: "cancelled" } as const;
    const findings = lintWebinarContent({
      title: setup.title,
      description: setup.description,
      blocks: webinar.blocks,
      form: webinar.form,
      presenters: webinar.presenters,
      recordingNotice: setup.recordingNotice,
    });
    if (hasBlockingWording(findings)) return { ok: false, error: "wording", findings } as const;
    if (setup.slug !== webinar.slug) {
      // Shared links and every mail already point at the published address.
      if (webinar.status !== "draft") return { ok: false, error: "slug_locked" } as const;
      const [taken] = await tx
        .select({ id: webinars.id })
        .from(webinars)
        .where(and(eq(webinars.slug, setup.slug), ne(webinars.id, webinar.id)));
      if (taken) return { ok: false, error: "slug_taken" } as const;
    }
    if (setup.courseId) {
      const [course] = await tx
        .select({ id: courses.id })
        .from(courses)
        .where(and(eq(courses.id, setup.courseId), ne(courses.status, "archived")));
      if (!course) return { ok: false, error: "course" } as const;
    }
    const moved =
      setup.startsAt.getTime() !== webinar.startsAt.getTime() ||
      setup.durationMinutes !== webinar.durationMinutes;
    if (moved && webinar.status === "published" && webinarEnd(setup).getTime() <= now.getTime()) {
      return { ok: false, error: "ended" } as const;
    }
    const session = await toolAdapter(webinar.tool).createSession({
      webinarId: webinar.id,
      title: setup.title,
      startsAt: setup.startsAt,
      durationMinutes: setup.durationMinutes,
      timeZone: setup.timeZone,
      joinUrl: setup.joinUrl,
      externalId: webinar.externalId,
    });
    const rescheduled = moved && webinar.status === "published";
    const [updated] = await tx
      .update(webinars)
      .set({
        slug: setup.slug,
        locale: setup.locale,
        title: setup.title,
        description: setup.description,
        startsAt: setup.startsAt,
        timeZone: setup.timeZone,
        durationMinutes: setup.durationMinutes,
        capacity: setup.capacity,
        joinUrl: session.joinUrl,
        externalId: session.externalId,
        courseId: setup.courseId,
        recorded: setup.recorded,
        recordingNotice: setup.recordingNotice,
        ...(rescheduled ? { sequence: sql`${webinars.sequence} + 1` } : {}),
      })
      .where(eq(webinars.id, webinar.id))
      .returning();
    if (rescheduled) await replan(tx, tenant, updated!, now);
    const capacityGrew =
      webinar.capacity !== null && (setup.capacity === null || setup.capacity > webinar.capacity);
    const promoted = capacityGrew ? await promoteWaitlist(tx, tenant, updated!, now) : [];
    return { ok: true, rescheduled, promoted: promoted.length, findings } as const;
  });
}

/** After a move: the old reminders go, new ones come, and everyone gets the new time. */
async function replan(tx: Transaction, tenant: TenantContext, webinar: WebinarRow, now: Date) {
  await skipWebinarMails(tx, { webinarId: webinar.id, steps: REMINDER_STEPS }, "rescheduled");
  // An update that has not gone out yet is replaced by this one.
  await skipWebinarMails(tx, { webinarId: webinar.id, steps: ["rescheduled"] }, "superseded");
  const people = await tx
    .select({
      id: webinarRegistrations.id,
      userId: webinarRegistrations.userId,
      status: webinarRegistrations.status,
    })
    .from(webinarRegistrations)
    .where(
      and(
        eq(webinarRegistrations.webinarId, webinar.id),
        inArray(webinarRegistrations.status, ["registered", "waitlist"]),
      ),
    );
  for (const person of people) {
    const registration = { id: person.id, userId: person.userId! };
    if (person.status === "registered") {
      await planReminders(tx, tenant.id, webinar, registration, now);
    }
    await queueWebinarMail(tx, tenant.id, {
      ...registration,
      webinarId: webinar.id,
      registrationId: person.id,
      step: "rescheduled",
    });
  }
}

type ContentUpdate =
  { blocks: LandingBlock[] } | { form: RegistrationForm } | { presenters: Presenter[] };

/**
 * The page, the form or the presenters. Certification wording in a title or
 * heading blocks saving; in running text it comes back as a warning.
 */
export async function updateWebinarContent(
  db: Database,
  tenantId: string,
  webinarId: string,
  update: ContentUpdate,
): Promise<
  | { ok: true; findings: WordingFinding[] }
  | { ok: false; error: "not_found" | "cancelled" }
  | { ok: false; error: "wording"; findings: WordingFinding[] }
> {
  return withTenant(db, tenantId, async (tx) => {
    const [webinar] = await tx.select().from(webinars).where(eq(webinars.id, webinarId));
    if (!webinar) return { ok: false, error: "not_found" } as const;
    if (webinar.status === "cancelled") return { ok: false, error: "cancelled" } as const;
    const next = { ...webinar, ...update };
    const findings = lintWebinarContent(next);
    if (hasBlockingWording(findings)) return { ok: false, error: "wording", findings } as const;
    await tx.update(webinars).set(update).where(eq(webinars.id, webinarId));
    return { ok: true, findings } as const;
  });
}

/** The publish checklist, as it stands. */
export async function webinarChecklist(
  db: Database,
  tenant: TenantContext,
  webinarId: string,
  now: Date = new Date(),
): Promise<WebinarPublishIssue[] | null> {
  return withTenant(db, tenant.id, (tx) => checklist(tx, tenant, webinarId, now));
}

async function checklist(
  tx: Transaction,
  tenant: TenantContext,
  webinarId: string,
  now: Date,
): Promise<WebinarPublishIssue[] | null> {
  const [webinar] = await tx.select().from(webinars).where(eq(webinars.id, webinarId));
  if (!webinar) return null;
  const [course] = webinar.courseId
    ? await tx
        .select({ status: courses.status })
        .from(courses)
        .where(eq(courses.id, webinar.courseId))
    : [];
  return webinarPublishIssues({
    content: webinar,
    startsAt: webinar.startsAt,
    durationMinutes: webinar.durationMinutes,
    joinUrl: webinar.joinUrl,
    legal: tenant.settings.legal_links,
    course: course ?? null,
    now,
  });
}

export async function publishWebinar(
  db: Database,
  tenant: TenantContext,
  webinarId: string,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; issues: WebinarPublishIssue[] }> {
  return withTenant(db, tenant.id, async (tx) => {
    const issues = await checklist(tx, tenant, webinarId, now);
    if (!issues) return { ok: false, issues: [] };
    if (issues.some((issue) => issue.severity === "error")) return { ok: false, issues };
    await tx
      .update(webinars)
      .set({ status: "published", publishedAt: now })
      .where(and(eq(webinars.id, webinarId), eq(webinars.status, "draft")));
    return { ok: true };
  });
}

/**
 * Cancelling a published webinar: the page says so, pending reminders stay
 * unsent, forms nobody confirmed are dropped, and everyone registered gets
 * a cancellation that takes it out of their calendar.
 */
export async function cancelWebinar(
  db: Database,
  tenant: TenantContext,
  webinarId: string,
  now: Date = new Date(),
): Promise<{ ok: boolean; notified: number }> {
  return withTenant(db, tenant.id, async (tx) => {
    const [webinar] = await tx
      .update(webinars)
      .set({ status: "cancelled", cancelledAt: now, sequence: sql`${webinars.sequence} + 1` })
      .where(and(eq(webinars.id, webinarId), eq(webinars.status, "published")))
      .returning();
    if (!webinar) return { ok: false, notified: 0 };
    await skipWebinarMails(tx, { webinarId }, "webinar_cancelled");
    await tx
      .delete(webinarRegistrations)
      .where(
        and(
          eq(webinarRegistrations.webinarId, webinarId),
          eq(webinarRegistrations.status, "pending"),
        ),
      );
    if (webinarPhase(webinar, now) === "ended") return { ok: true, notified: 0 };
    const people = await tx
      .select({ id: webinarRegistrations.id, userId: webinarRegistrations.userId })
      .from(webinarRegistrations)
      .where(
        and(
          eq(webinarRegistrations.webinarId, webinarId),
          inArray(webinarRegistrations.status, ["registered", "waitlist"]),
        ),
      );
    for (const person of people) {
      await queueWebinarMail(tx, tenant.id, {
        userId: person.userId!,
        webinarId,
        registrationId: person.id,
        step: "cancelled",
      });
    }
    return { ok: true, notified: people.length };
  });
}

/** Drafts nobody could register for can go entirely. */
export async function deleteDraftWebinar(
  db: Database,
  tenantId: string,
  webinarId: string,
): Promise<boolean> {
  const removed = await withTenant(db, tenantId, (tx) =>
    tx
      .delete(webinars)
      .where(and(eq(webinars.id, webinarId), eq(webinars.status, "draft")))
      .returning({ id: webinars.id }),
  );
  return removed.length > 0;
}

export interface StudioWebinarRow {
  id: string;
  slug: string;
  title: string;
  status: WebinarRow["status"];
  locale: string;
  startsAt: Date;
  timeZone: string;
  durationMinutes: number;
  capacity: number | null;
  registered: number;
  waitlist: number;
  attended: number;
}

export async function listStudioWebinars(
  db: Database,
  tenantId: string,
): Promise<StudioWebinarRow[]> {
  return withTenant(db, tenantId, (tx) =>
    tx
      .select({
        id: webinars.id,
        slug: webinars.slug,
        title: webinars.title,
        status: webinars.status,
        locale: webinars.locale,
        startsAt: webinars.startsAt,
        timeZone: webinars.timeZone,
        durationMinutes: webinars.durationMinutes,
        capacity: webinars.capacity,
        registered: sql<number>`(select count(*)::int from ${webinarRegistrations} r where r.webinar_id = "webinars"."id" and r.status = 'registered')`,
        waitlist: sql<number>`(select count(*)::int from ${webinarRegistrations} r where r.webinar_id = "webinars"."id" and r.status = 'waitlist')`,
        attended: sql<number>`(select count(*)::int from ${webinarAttendance} a where a.webinar_id = "webinars"."id")`,
      })
      .from(webinars)
      .orderBy(asc(webinars.startsAt)),
  );
}

export interface StudioWebinar {
  webinar: WebinarRow;
  course: { id: string; slug: string; title: LocalizedText; status: string } | null;
  counts: {
    registered: number;
    waitlist: number;
    cancelled: number;
    pending: number;
    attended: number;
  };
}

export async function loadStudioWebinar(
  db: Database,
  tenantId: string,
  webinarId: string,
): Promise<StudioWebinar | null> {
  return withTenant(db, tenantId, async (tx) => {
    const [webinar] = await tx.select().from(webinars).where(eq(webinars.id, webinarId));
    if (!webinar) return null;
    const [course] = webinar.courseId
      ? await tx
          .select({
            id: courses.id,
            slug: courses.slug,
            title: courses.title,
            status: courses.status,
          })
          .from(courses)
          .where(eq(courses.id, webinar.courseId))
      : [];
    const byStatus = await tx
      .select({ status: webinarRegistrations.status, n })
      .from(webinarRegistrations)
      .where(eq(webinarRegistrations.webinarId, webinarId))
      .groupBy(webinarRegistrations.status);
    const [attended] = await tx
      .select({ n })
      .from(webinarAttendance)
      .where(eq(webinarAttendance.webinarId, webinarId));
    const count = (status: string) => byStatus.find((row) => row.status === status)?.n ?? 0;
    return {
      webinar,
      course: course ?? null,
      counts: {
        registered: count("registered"),
        waitlist: count("waitlist"),
        cancelled: count("cancelled"),
        pending: count("pending"),
        attended: attended?.n ?? 0,
      },
    };
  });
}

/** Contact details of learners who agreed to be contacted (lead handoff), by user id. */
async function contacts(
  tx: Transaction,
  tenantId: string,
  userIds: string[],
): Promise<Map<string, { email: string; name: string | null }>> {
  if (userIds.length === 0) return new Map();
  const rows = await tx
    .select({ userId: consents.userId, email: user.email, name: learnerProfiles.displayName })
    .from(consents)
    .innerJoin(user, eq(user.id, consents.userId))
    .leftJoin(
      learnerProfiles,
      and(eq(learnerProfiles.userId, consents.userId), eq(learnerProfiles.tenantId, tenantId)),
    )
    .where(
      and(
        inArray(consents.userId, userIds),
        eq(consents.kind, "lead_handoff"),
        isNotNull(consents.confirmedAt),
        isNull(consents.revokedAt),
      ),
    );
  return new Map(rows.map((row) => [row.userId, { email: row.email, name: row.name || null }]));
}

export interface Registrant {
  id: string;
  alias: string;
  status: "registered" | "waitlist" | "cancelled";
  confirmedAt: Date | null;
  promotedAt: Date | null;
  cancelledAt: Date | null;
  attendance: { source: string; durationMinutes: number | null } | null;
  /** Only with a confirmed, unrevoked consent to be contacted. */
  contact: { email: string; name: string | null; answers: Record<string, string> } | null;
  utmSource: string | null;
}

export async function listRegistrants(
  db: Database,
  tenantId: string,
  webinarId: string,
): Promise<Registrant[]> {
  return withTenant(db, tenantId, async (tx) => {
    const rows = await tx
      .select({ registration: webinarRegistrations, attendance: webinarAttendance })
      .from(webinarRegistrations)
      .leftJoin(
        webinarAttendance,
        and(
          eq(webinarAttendance.webinarId, webinarRegistrations.webinarId),
          eq(webinarAttendance.userId, webinarRegistrations.userId),
        ),
      )
      .where(
        and(
          eq(webinarRegistrations.webinarId, webinarId),
          ne(webinarRegistrations.status, "pending"),
        ),
      )
      .orderBy(asc(webinarRegistrations.confirmedAt), asc(webinarRegistrations.id));
    const known = await contacts(
      tx,
      tenantId,
      rows.map((row) => row.registration.userId!),
    );
    return rows.map(({ registration, attendance }) => {
      const contact = known.get(registration.userId!);
      return {
        id: registration.id,
        alias: learnerAlias(tenantId, registration.userId!),
        status: registration.status as Registrant["status"],
        confirmedAt: registration.confirmedAt,
        promotedAt: registration.promotedAt,
        cancelledAt: registration.cancelledAt,
        attendance: attendance
          ? { source: attendance.source, durationMinutes: attendance.durationMinutes }
          : null,
        contact: contact
          ? {
              email: contact.email,
              name: registration.answers.name ?? contact.name,
              answers: registration.answers,
            }
          : null,
        utmSource: registration.entryContext.utm?.source ?? null,
      };
    });
  });
}

export interface RegistrationDigest {
  /** Free-text answers (questions for the host), with nothing that says whose. */
  questions: Array<{ fieldId: string; label: string; answers: string[] }>;
  /** Choices, counted. */
  choices: Array<{ fieldId: string; label: string; counts: Array<{ option: string; n: number }> }>;
}

/** The pre-webinar questions as an anonymous digest, and choices as counts (webinar brief §3). */
export async function registrationDigest(
  db: Database,
  tenantId: string,
  webinarId: string,
): Promise<RegistrationDigest | null> {
  return withTenant(db, tenantId, async (tx) => {
    const [webinar] = await tx
      .select({ form: webinars.form })
      .from(webinars)
      .where(eq(webinars.id, webinarId));
    if (!webinar) return null;
    const answers = (
      await tx
        .select({ answers: webinarRegistrations.answers })
        .from(webinarRegistrations)
        .where(
          and(
            eq(webinarRegistrations.webinarId, webinarId),
            inArray(webinarRegistrations.status, ["registered", "waitlist"]),
          ),
        )
    ).map((row) => row.answers);
    const fields = webinar.form.fields;
    return {
      questions: fields
        .filter((field) => field.kind === "textarea")
        .map((field) => ({
          fieldId: field.id,
          label: field.label,
          // Sorted, so the order says nothing about who asked first.
          answers: answers
            .map((row) => row[field.id])
            .filter((value): value is string => Boolean(value))
            .sort((a, b) => a.localeCompare(b)),
        })),
      choices: fields
        .filter((field) => field.kind === "select")
        .map((field) => ({
          fieldId: field.id,
          label: field.label,
          counts: (field.options ?? []).map((option) => ({
            option,
            n: answers.filter((row) => row[field.id] === option).length,
          })),
        })),
    };
  });
}

export type WebinarFunnel = Array<{ step: WebinarFunnelStep; count: number }>;

/**
 * Views → registrations → confirmed → attended, then the linked course
 * (started, handed in, passed) among registrants, counting only what they
 * did after registering: the webinar brought them there.
 */
export async function webinarFunnel(
  db: Database,
  tenantId: string,
  webinarId: string,
): Promise<WebinarFunnel | null> {
  return withTenant(db, tenantId, async (tx) => {
    const [webinar] = await tx
      .select({ id: webinars.id, courseId: webinars.courseId })
      .from(webinars)
      .where(eq(webinars.id, webinarId));
    if (!webinar) return null;
    const ofWebinar = sql`${events.props}->>'webinar_id' = ${webinarId}`;
    const [views] = await tx
      .select({ n })
      .from(events)
      .where(and(eq(events.name, "webinar_page_viewed"), ofWebinar));
    const [registrations] = await tx
      .select({ n })
      .from(events)
      .where(and(eq(events.name, "webinar_registered"), ofWebinar));
    const [confirmed] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(webinarRegistrations)
      .where(
        and(
          eq(webinarRegistrations.webinarId, webinarId),
          isNotNull(webinarRegistrations.confirmedAt),
        ),
      );
    const [attended] = await tx
      .select({ n })
      .from(webinarAttendance)
      .where(eq(webinarAttendance.webinarId, webinarId));
    const afterRegistering = async (names: string[]) => {
      if (!webinar.courseId) return 0;
      const [row] = await tx
        .select({ n: sql<number>`count(distinct ${events.userId})::int` })
        .from(events)
        .innerJoin(
          webinarRegistrations,
          and(
            eq(webinarRegistrations.userId, events.userId),
            eq(webinarRegistrations.webinarId, webinarId),
            isNotNull(webinarRegistrations.confirmedAt),
          ),
        )
        .where(
          and(
            inArray(events.name, names),
            eq(events.courseId, webinar.courseId),
            sql`${events.occurredAt} >= ${webinarRegistrations.confirmedAt}`,
          ),
        );
      return row?.n ?? 0;
    };
    const counts: Record<WebinarFunnelStep, number> = {
      views: views?.n ?? 0,
      registrations: registrations?.n ?? 0,
      confirmed: confirmed?.n ?? 0,
      attended: attended?.n ?? 0,
      course_started: await afterRegistering(["course_started"]),
      course_submitted: await afterRegistering(["assignment_submitted", "test_submitted"]),
      course_passed: await afterRegistering(["course_completed"]),
    };
    return WEBINAR_FUNNEL_STEPS.filter(
      (step) => webinar.courseId || !step.startsWith("course_"),
    ).map((step) => ({ step, count: counts[step] }));
  });
}

export interface AttendanceMatch {
  line: number;
  registrationId: string;
  alias: string;
  /** Only with the learner's consent to be contacted. */
  email: string | null;
  durationMinutes: number | null;
  /** They were counted already (checked in, or an earlier file). */
  already: boolean;
}

export interface AttendancePreview {
  format: AttendanceParse["format"];
  matched: AttendanceMatch[];
  /** Addresses from the file nobody registered with: the host's own data, shown as it is. */
  unmatched: Array<{ line: number; email: string }>;
  skipped: AttendanceParse["skipped"];
}

async function matchAttendance(
  tx: Transaction,
  tenantId: string,
  webinarId: string,
  parse: AttendanceParse,
): Promise<AttendancePreview & { userIds: Map<string, string> }> {
  const registrants = await tx
    .select({
      id: webinarRegistrations.id,
      userId: webinarRegistrations.userId,
      email: user.email,
      attended: webinarAttendance.id,
    })
    .from(webinarRegistrations)
    .innerJoin(user, eq(user.id, webinarRegistrations.userId))
    .leftJoin(
      webinarAttendance,
      and(
        eq(webinarAttendance.webinarId, webinarRegistrations.webinarId),
        eq(webinarAttendance.userId, webinarRegistrations.userId),
      ),
    )
    .where(
      and(
        eq(webinarRegistrations.webinarId, webinarId),
        ne(webinarRegistrations.status, "pending"),
      ),
    );
  const byEmail = new Map(registrants.map((row) => [row.email.toLowerCase(), row]));
  const known = await contacts(
    tx,
    tenantId,
    registrants.map((row) => row.userId!),
  );
  const matched: AttendanceMatch[] = [];
  const unmatched: AttendancePreview["unmatched"] = [];
  const userIds = new Map<string, string>();
  for (const row of parse.rows) {
    const registrant = byEmail.get(row.email);
    if (!registrant) {
      unmatched.push({ line: row.line, email: row.email });
      continue;
    }
    userIds.set(registrant.id, registrant.userId!);
    matched.push({
      line: row.line,
      registrationId: registrant.id,
      alias: learnerAlias(tenantId, registrant.userId!),
      email: known.get(registrant.userId!)?.email ?? null,
      durationMinutes: row.durationMinutes,
      already: registrant.attended !== null,
    });
  }
  return { format: parse.format, matched, unmatched, skipped: parse.skipped, userIds };
}

/** What a file would change, before anything is saved. */
export async function previewAttendance(
  db: Database,
  tenantId: string,
  webinarId: string,
  parse: AttendanceParse,
): Promise<AttendancePreview> {
  const { userIds: _ignored, ...preview } = await withTenant(db, tenantId, (tx) =>
    matchAttendance(tx, tenantId, webinarId, parse),
  );
  return preview;
}

/** Saves the matched rows as attendance (from the tool's report or a list the host kept). */
export async function importAttendance(
  db: Database,
  tenant: TenantContext,
  webinarId: string,
  parse: AttendanceParse,
): Promise<{ added: number; updated: number; unmatched: number } | null> {
  return withTenant(db, tenant.id, async (tx) => {
    const [webinar] = await tx.select().from(webinars).where(eq(webinars.id, webinarId));
    if (!webinar) return null;
    const preview = await matchAttendance(tx, tenant.id, webinarId, parse);
    const source = parse.format === "emails" ? "manual" : "tool_report";
    let added = 0;
    let updated = 0;
    for (const match of preview.matched) {
      const row = parse.rows.find((candidate) => candidate.line === match.line)!;
      const created = await recordAttendance(tx, tenant, webinar, {
        userId: preview.userIds.get(match.registrationId)!,
        source,
        joinedAt: row.joinedAt,
        leftAt: row.leftAt,
        durationMinutes: row.durationMinutes,
      });
      if (created) added++;
      else updated++;
    }
    return { added, updated, unmatched: preview.unmatched.length };
  });
}

/** The host ticks or unticks someone by hand (source "manual"). */
export async function setAttendance(
  db: Database,
  tenant: TenantContext,
  webinarId: string,
  registrationId: string,
  attended: boolean,
): Promise<boolean> {
  return withTenant(db, tenant.id, async (tx) => {
    const [webinar] = await tx.select().from(webinars).where(eq(webinars.id, webinarId));
    const [registration] = await tx
      .select()
      .from(webinarRegistrations)
      .where(
        and(
          eq(webinarRegistrations.id, registrationId),
          eq(webinarRegistrations.webinarId, webinarId),
        ),
      );
    if (!webinar || !registration?.userId) return false;
    if (attended) {
      await recordAttendance(tx, tenant, webinar, {
        userId: registration.userId,
        source: "manual",
        joinedAt: null,
        leftAt: null,
        durationMinutes: null,
      });
    } else {
      await tx
        .delete(webinarAttendance)
        .where(
          and(
            eq(webinarAttendance.webinarId, webinarId),
            eq(webinarAttendance.userId, registration.userId),
          ),
        );
    }
    return true;
  });
}

/** For the course picker: courses a webinar can lead into. */
export async function courseOptions(db: Database, tenantId: string) {
  return withTenant(db, tenantId, (tx) =>
    tx
      .select({ id: courses.id, title: courses.title, status: courses.status })
      .from(courses)
      .where(ne(courses.status, "archived"))
      .orderBy(desc(courses.updatedAt)),
  );
}
