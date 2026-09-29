import { and, eq, inArray, sql } from "drizzle-orm";

import { entryQuery } from "@/core/entry/context";
import { localize } from "@/core/i18n/locales";
import { tenantTranslator } from "@/core/i18n/tenant-translator";
import type { Translator } from "@/core/i18n/translator";
import type { TenantContext } from "@/core/tenant/context";
import { buildIcs, webinarUid, type IcsMethod } from "@/core/webinars/ics";
import { JOIN_OPENS_MINUTES, webinarEnd } from "@/core/webinars/phase";
import { reminderSchedule, webinarMailDue, type WebinarMailStep } from "@/core/webinars/reminders";
import { formatWebinarTime } from "@/core/webinars/time";
import type { Transaction } from "@/db/client";
import {
  courses,
  notifications,
  webinarAttendance,
  webinarRegistrations,
  webinars,
  type WebinarMailPayload,
} from "@/db/schema";
import { senderFor, type OutgoingEmail } from "@/server/email/mailer";
import { renderNoticeEmail, type NoticeEmailInput } from "@/server/email/templates/notice";
import { academyUrl } from "@/server/platform/config";
import { cancelUrl, webinarUrl } from "@/server/webinars/links";

/*
 * Mail around a webinar (webinar brief §3, reminder sequence): queued in the
 * outbox in the transaction of what it reports, planned ahead for the
 * reminders, and written when it goes out, in the registrant's language.
 * A mail that is no longer true by then stays unsent (webinarMailDue).
 */

type WebinarRow = typeof webinars.$inferSelect;
type RegistrationRow = typeof webinarRegistrations.$inferSelect;

export async function queueWebinarMail(
  tx: Transaction,
  tenantId: string,
  input: {
    userId: string;
    webinarId: string;
    registrationId: string;
    step: WebinarMailStep;
    sendAfter?: Date;
    plannedFor?: Date;
    hadSeat?: boolean;
  },
): Promise<void> {
  const payload: WebinarMailPayload = {
    webinarId: input.webinarId,
    registrationId: input.registrationId,
    step: input.step,
    ...(input.plannedFor ? { plannedFor: input.plannedFor.toISOString() } : {}),
    ...(input.hadSeat ? { hadSeat: true } : {}),
  };
  await tx.insert(notifications).values({
    tenantId,
    userId: input.userId,
    kind: "webinar",
    payload,
    sendAfter: input.sendAfter ?? new Date(),
  });
}

/** The reminders still ahead for someone who has a seat now (past ones are skipped). */
export async function planReminders(
  tx: Transaction,
  tenantId: string,
  webinar: Pick<WebinarRow, "id" | "startsAt" | "durationMinutes">,
  registration: { id: string; userId: string },
  now: Date,
): Promise<void> {
  for (const { step, sendAt } of reminderSchedule(webinar, now)) {
    await queueWebinarMail(tx, tenantId, {
      userId: registration.userId,
      webinarId: webinar.id,
      registrationId: registration.id,
      step,
      sendAfter: sendAt,
      plannedFor: webinar.startsAt,
    });
  }
}

/** Marks a webinar's (or one registration's) waiting mails as not to be sent. */
export async function skipWebinarMails(
  tx: Transaction,
  filter: { webinarId: string; registrationId?: string; steps?: readonly WebinarMailStep[] },
  note: string,
): Promise<void> {
  await tx
    .update(notifications)
    .set({ status: "skipped", note, processedAt: new Date() })
    .where(
      and(
        eq(notifications.kind, "webinar"),
        eq(notifications.status, "pending"),
        sql`${notifications.payload}->>'webinarId' = ${filter.webinarId}`,
        filter.registrationId
          ? sql`${notifications.payload}->>'registrationId' = ${filter.registrationId}`
          : undefined,
        filter.steps
          ? inArray(sql`${notifications.payload}->>'step'`, [...filter.steps])
          : undefined,
      ),
    );
}

/** The calendar entry: one UID per webinar, the webinar's current SEQUENCE. */
export function webinarCalendar(
  tenant: TenantContext,
  webinar: Pick<WebinarRow, "id" | "slug" | "title" | "startsAt" | "durationMinutes" | "sequence">,
  t: Translator,
  options: { method: IcsMethod; attendee?: string },
): string {
  const sender = senderFor(tenant);
  const page = webinarUrl(tenant, webinar.slug);
  return buildIcs({
    method: options.method,
    organizer: { name: sender.name, email: sender.address },
    attendee: options.attendee,
    now: new Date(),
    events: [
      {
        uid: webinarUid(webinar.id, tenant.primaryDomain),
        sequence: webinar.sequence,
        start: webinar.startsAt,
        end: webinarEnd(webinar),
        summary: webinar.title,
        description: `${t.t("email.webinar.calendarNote", { minutes: JOIN_OPENS_MINUTES })}\n${page}`,
        url: page,
        location: page,
      },
    ],
  });
}

/** Where the course behind a webinar starts, with the webinar as the source (no cookie). */
export function courseEntryUrl(
  tenant: TenantContext,
  courseSlug: string,
  webinarSlug: string,
  medium: "email" | "landing",
): string {
  const query = entryQuery({
    course: courseSlug,
    utm: { source: "webinar", medium, campaign: webinarSlug },
  });
  return academyUrl(tenant, `/start?${query}`);
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

type Content = Omit<NoticeEmailInput, "tenant" | "t" | "reason"> & {
  calendar?: IcsMethod;
};

async function content(
  tx: Transaction,
  tenant: TenantContext,
  t: Translator,
  payload: WebinarMailPayload,
  webinar: WebinarRow,
  registration: RegistrationRow,
): Promise<Content> {
  const step = payload.step;
  const title = webinar.title;
  const academy = tenant.settings.author_display_name;
  const time = formatWebinarTime(
    webinar.startsAt,
    webinar.durationMinutes,
    webinar.timeZone,
    t.locale,
  );
  const list = [
    t.t("email.webinar.when", { time }),
    t.t("email.webinar.language", {
      language: t.t(webinar.locale === "de" ? "webinar.language.de" : "webinar.language.en"),
    }),
  ];
  const page = { label: t.t("email.webinar.pageButton"), url: webinarUrl(tenant, webinar.slug) };
  const others = { label: t.t("webinar.moreWebinars"), url: academyUrl(tenant, "/webinars") };
  const cancel = {
    before: t.t("email.webinar.cantMakeIt"),
    label: t.t("email.webinar.cancelLink"),
    url: cancelUrl(tenant, webinar.slug, registration.id),
  };
  const joinInfo = t.t("email.webinar.joinInfo", { minutes: JOIN_OPENS_MINUTES });
  const waitlisted = registration.status === "waitlist";
  const text = (key: string) => t.t(key as Parameters<Translator["t"]>[0], { title, academy });

  switch (step) {
    case "confirmation":
    case "promoted":
      return {
        subject: text(`email.webinar.${step}.subject`),
        heading: text(`email.webinar.${step}.heading`),
        paragraphs: [text(`email.webinar.${step}.body`)],
        list,
        button: page,
        note: joinInfo,
        link: cancel,
        calendar: "REQUEST",
      };
    case "waitlist":
      return {
        subject: text("email.webinar.waitlist.subject"),
        heading: text("email.webinar.waitlist.heading"),
        paragraphs: [text("email.webinar.waitlist.body")],
        list,
        button: page,
        link: cancel,
      };
    case "reminder_24h":
    case "reminder_1h":
      return {
        subject: text(`email.webinar.${step}.subject`),
        heading: text(`email.webinar.${step}.heading`),
        paragraphs: [text(`email.webinar.${step}.body`)],
        list,
        button: page,
        note: joinInfo,
        link: cancel,
      };
    case "starting":
      return {
        subject: text("email.webinar.starting.subject"),
        heading: text("email.webinar.starting.heading"),
        paragraphs: [
          text(webinar.joinUrl ? "email.webinar.starting.body" : "email.webinar.starting.noLink"),
        ],
        list,
        // The join link, for once in the open: only registrants get this mail, at the start.
        button: webinar.joinUrl
          ? { label: t.t("email.webinar.joinButton"), url: webinar.joinUrl }
          : page,
      };
    case "followup": {
      const [course] = webinar.courseId
        ? await tx
            .select({ slug: courses.slug, title: courses.title, status: courses.status })
            .from(courses)
            .where(eq(courses.id, webinar.courseId))
        : [];
      const open = course?.status === "published" ? course : null;
      const [attended] = await tx
        .select({ id: webinarAttendance.id })
        .from(webinarAttendance)
        .where(
          and(
            eq(webinarAttendance.webinarId, webinar.id),
            eq(webinarAttendance.userId, registration.userId!),
          ),
        );
      return {
        subject: text("email.webinar.followup.subject"),
        heading: attended
          ? text("email.webinar.followup.heading")
          : text("email.webinar.followup.subject"),
        paragraphs: [
          text("email.webinar.followup.body"),
          open
            ? t.t("email.webinar.followup.course", {
                course: localize(open.title, t.locale, [tenant.settings.default_locale]),
              })
            : text("email.webinar.followup.noCourse"),
        ],
        button: open
          ? {
              label: t.t("email.webinar.courseButton"),
              url: courseEntryUrl(tenant, open.slug, webinar.slug, "email"),
            }
          : others,
      };
    }
    case "rescheduled":
      return {
        subject: text("email.webinar.rescheduled.subject"),
        heading: text("email.webinar.rescheduled.heading"),
        paragraphs: [
          text(
            waitlisted
              ? "email.webinar.rescheduled.bodyWaitlist"
              : "email.webinar.rescheduled.body",
          ),
        ],
        list,
        button: page,
        link: cancel,
        calendar: waitlisted ? undefined : "REQUEST",
      };
    case "cancelled":
      return {
        subject: text("email.webinar.cancelled.subject"),
        heading: text("email.webinar.cancelled.heading"),
        paragraphs: [
          text(
            waitlisted ? "email.webinar.cancelled.bodyWaitlist" : "email.webinar.cancelled.body",
          ),
        ],
        list,
        button: others,
        calendar: waitlisted ? undefined : "CANCEL",
      };
    case "registration_cancelled":
      return {
        subject: text("email.webinar.registration_cancelled.subject"),
        heading: text("email.webinar.registration_cancelled.heading"),
        paragraphs: [text("email.webinar.registration_cancelled.body")],
        list,
        button: page,
        // Only a seat was ever in their calendar; a waitlist place never was.
        calendar: payload.hadSeat ? "CANCEL" : undefined,
      };
  }
}

/** Writes one queued webinar mail, or says why it stays unsent. */
export async function webinarMail(
  tx: Transaction,
  tenant: TenantContext,
  to: string,
  userId: string,
  payload: WebinarMailPayload,
): Promise<{ mail: OutgoingEmail } | { skip: string }> {
  const [row] = await tx
    .select({ registration: webinarRegistrations, webinar: webinars })
    .from(webinarRegistrations)
    .innerJoin(webinars, eq(webinars.id, webinarRegistrations.webinarId))
    .where(eq(webinarRegistrations.id, payload.registrationId));
  if (!row || row.registration.userId !== userId) return { skip: "gone" };
  const { registration, webinar } = row;
  const due = webinarMailDue(payload.step, {
    registration: registration.status,
    webinar: webinar.status,
    plannedFor: payload.plannedFor,
    startsAt: webinar.startsAt,
  });
  if (due !== "send") return { skip: due };

  const t = tenantTranslator(tenant, registration.locale);
  const { calendar, ...notice } = await content(tx, tenant, t, payload, webinar, registration);
  const rendered = await renderNoticeEmail({
    tenant,
    t,
    ...notice,
    reason: t.t("email.webinar.reason", { academy: tenant.settings.author_display_name }),
  });
  return {
    mail: outgoing(
      tenant,
      to,
      rendered,
      calendar
        ? {
            method: calendar,
            content: webinarCalendar(tenant, webinar, t, { method: calendar, attendee: to }),
          }
        : undefined,
    ),
  };
}
