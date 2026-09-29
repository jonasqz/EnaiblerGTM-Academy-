import { and, asc, desc, eq, gt, inArray, lte, ne, sql } from "drizzle-orm";

import { requiresWork, type CompletionMode } from "@/core/courses/completion";
import type { EntryContext } from "@/core/entry/context";
import type { LocalizedText } from "@/core/i18n/locales";
import { webinarPhase } from "@/core/webinars/phase";
import type { Database } from "@/db/client";
import {
  assignments,
  courses,
  webinarAttendance,
  webinarRegistrations,
  webinars,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { trackEvent } from "@/server/events";
import { seatsTaken } from "@/server/webinars/registration";

/*
 * What learners and visitors see of webinars: the list, a webinar's landing
 * page with its seats, their own registration. The join link and the
 * check-in code never leave here for anyone but those who may see them.
 */

type WebinarRow = typeof webinars.$inferSelect;

/** A webinar as the public page may show it: no join link, no check-in code. */
export type PublicWebinar = Omit<WebinarRow, "joinUrl" | "checkinCode" | "externalId">;

function publicPart(row: WebinarRow): PublicWebinar {
  const view: Partial<WebinarRow> = { ...row };
  delete view.joinUrl;
  delete view.checkinCode;
  delete view.externalId;
  return view as PublicWebinar;
}

export interface WebinarCourse {
  slug: string;
  title: LocalizedText;
  published: boolean;
  completionMode: CompletionMode;
  /** What learners build there; null when the course ends with its test alone. */
  artifactName: LocalizedText | null;
}

export interface WebinarPage {
  webinar: PublicWebinar;
  course: WebinarCourse | null;
  taken: number;
}

/** Published and cancelled webinars for everyone; drafts only when the caller may preview them. */
export async function loadWebinarPage(
  db: Database,
  tenantId: string,
  slug: string,
  options: { drafts: boolean },
): Promise<WebinarPage | null> {
  return withTenant(db, tenantId, async (tx) => {
    const [webinar] = await tx.select().from(webinars).where(eq(webinars.slug, slug));
    if (!webinar || (webinar.status === "draft" && !options.drafts)) return null;
    const [course] = webinar.courseId
      ? await tx
          .select({ course: courses, artifactName: assignments.artifactName })
          .from(courses)
          .leftJoin(assignments, eq(assignments.courseId, courses.id))
          .where(eq(courses.id, webinar.courseId))
      : [];
    return {
      webinar: publicPart(webinar),
      course: course
        ? {
            slug: course.course.slug,
            title: course.course.title,
            published: course.course.status === "published",
            completionMode: course.course.completionMode,
            artifactName: requiresWork(course.course.completionMode) ? course.artifactName : null,
          }
        : null,
      taken: await seatsTaken(tx, webinar.id),
    };
  });
}

export interface ViewerRegistration {
  id: string;
  status: "pending" | "registered" | "waitlist" | "cancelled";
  attended: boolean;
  /** Only for a seat, and only from shortly before the start (the page decides when). */
  joinUrl: string | null;
}

/** The signed-in viewer's own registration for a webinar. */
export async function viewerRegistration(
  db: Database,
  tenantId: string,
  webinarId: string,
  userId: string,
): Promise<ViewerRegistration | null> {
  return withTenant(db, tenantId, async (tx) => {
    const [row] = await tx
      .select({
        id: webinarRegistrations.id,
        status: webinarRegistrations.status,
        joinUrl: webinars.joinUrl,
        attended: webinarAttendance.id,
      })
      .from(webinarRegistrations)
      .innerJoin(webinars, eq(webinars.id, webinarRegistrations.webinarId))
      .leftJoin(
        webinarAttendance,
        and(
          eq(webinarAttendance.webinarId, webinarRegistrations.webinarId),
          eq(webinarAttendance.userId, webinarRegistrations.userId),
        ),
      )
      .where(
        and(eq(webinarRegistrations.webinarId, webinarId), eq(webinarRegistrations.userId, userId)),
      );
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      attended: row.attended !== null,
      joinUrl: row.status === "registered" ? row.joinUrl : null,
    };
  });
}

export interface WebinarListItem {
  webinar: PublicWebinar;
  taken: number;
}

/** Upcoming (and running) webinars first, soonest first; then the latest past ones. */
export async function listPublicWebinars(
  db: Database,
  tenantId: string,
  now: Date = new Date(),
): Promise<{ upcoming: WebinarListItem[]; past: WebinarListItem[] }> {
  return withTenant(db, tenantId, async (tx) => {
    const withSeats = sql<number>`(select count(*)::int from ${webinarRegistrations} r where r.webinar_id = "webinars"."id" and r.status = 'registered')`;
    const rows = await tx
      .select({ webinar: webinars, taken: withSeats })
      .from(webinars)
      .where(
        and(
          eq(webinars.status, "published"),
          gt(
            sql`${webinars.startsAt} + make_interval(mins => ${webinars.durationMinutes})`,
            sql`${now.toISOString()}::timestamptz`,
          ),
        ),
      )
      .orderBy(asc(webinars.startsAt));
    const past = await tx
      .select({ webinar: webinars, taken: withSeats })
      .from(webinars)
      .where(
        and(
          eq(webinars.status, "published"),
          lte(
            sql`${webinars.startsAt} + make_interval(mins => ${webinars.durationMinutes})`,
            sql`${now.toISOString()}::timestamptz`,
          ),
        ),
      )
      .orderBy(desc(webinars.startsAt))
      .limit(12);
    const item = (row: { webinar: WebinarRow; taken: number }) => ({
      webinar: publicPart(row.webinar),
      taken: row.taken,
    });
    return { upcoming: rows.map(item), past: past.map(item) };
  });
}

/** Whether the academy has webinars to show (the header links to them only then). */
export async function hasPublicWebinars(db: Database, tenantId: string): Promise<boolean> {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx.select({ id: webinars.id }).from(webinars).where(eq(webinars.status, "published")).limit(1),
  );
  return row !== undefined;
}

export interface MyWebinar {
  registrationId: string;
  status: "registered" | "waitlist";
  slug: string;
  title: string;
  /** The webinar's language (its title is in it). */
  locale: string;
  startsAt: Date;
  durationMinutes: number;
  timeZone: string;
  webinarStatus: WebinarRow["status"];
  phase: ReturnType<typeof webinarPhase>;
  attended: boolean;
}

/** The learner's registrations (seat or waitlist), for "My learning". */
export async function myWebinars(
  db: Database,
  tenantId: string,
  userId: string,
  now: Date = new Date(),
): Promise<MyWebinar[]> {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .select({
        registrationId: webinarRegistrations.id,
        status: webinarRegistrations.status,
        webinar: webinars,
        attended: webinarAttendance.id,
      })
      .from(webinarRegistrations)
      .innerJoin(webinars, eq(webinars.id, webinarRegistrations.webinarId))
      .leftJoin(
        webinarAttendance,
        and(
          eq(webinarAttendance.webinarId, webinarRegistrations.webinarId),
          eq(webinarAttendance.userId, webinarRegistrations.userId),
        ),
      )
      .where(
        and(
          eq(webinarRegistrations.userId, userId),
          inArray(webinarRegistrations.status, ["registered", "waitlist"]),
          ne(webinars.status, "draft"),
        ),
      )
      .orderBy(desc(webinars.startsAt)),
  );
  return rows.map((row) => ({
    registrationId: row.registrationId,
    status: row.status as MyWebinar["status"],
    slug: row.webinar.slug,
    title: row.webinar.title,
    locale: row.webinar.locale,
    startsAt: row.webinar.startsAt,
    durationMinutes: row.webinar.durationMinutes,
    timeZone: row.webinar.timeZone,
    webinarStatus: row.webinar.status,
    phase: webinarPhase(row.webinar, now),
    attended: row.attended !== null,
  }));
}

/** The registration a mail's cancel link names (the caller has checked the link's key). */
export async function cancellableRegistration(
  db: Database,
  tenantId: string,
  registrationId: string,
  now: Date = new Date(),
): Promise<{ webinar: PublicWebinar; cancellable: boolean } | null> {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ status: webinarRegistrations.status, webinar: webinars })
      .from(webinarRegistrations)
      .innerJoin(webinars, eq(webinars.id, webinarRegistrations.webinarId))
      .where(eq(webinarRegistrations.id, registrationId)),
  );
  if (!row) return null;
  return {
    webinar: publicPart(row.webinar),
    cancellable:
      (row.status === "registered" || row.status === "waitlist") &&
      row.webinar.status === "published" &&
      webinarPhase(row.webinar, now) !== "ended",
  };
}

/** A visitor opened the landing page (never bots; the caller checks). */
export async function recordWebinarView(
  db: Database,
  tenantId: string,
  webinar: Pick<WebinarRow, "id" | "slug" | "courseId">,
  context: { locale: string; entry: EntryContext; embedded?: boolean },
): Promise<void> {
  await withTenant(db, tenantId, (tx) =>
    trackEvent(tx, {
      tenantId,
      name: "webinar_page_viewed",
      courseId: webinar.courseId,
      locale: context.locale,
      entry: context.entry,
      props: {
        webinar_id: webinar.id,
        webinar_slug: webinar.slug,
        ...(context.embedded ? { embedded: true } : {}),
      },
    }),
  );
}
