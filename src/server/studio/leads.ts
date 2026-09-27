import { and, asc, desc, eq, exists, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";

import { fromSharedCredential, shareChannelOf, type ShareChannel } from "@/core/credentials/share";
import type { LocalizedText } from "@/core/i18n/locales";
import { learnerAlias } from "@/core/people/alias";
import type { Lead, LeadCourse } from "@/core/people/leads";
import type { Database, Transaction } from "@/db/client";
import {
  consents,
  courses,
  credentials,
  enrollments,
  events,
  learnerProfiles,
  user,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";

/*
 * Leads in the Studio (brief §9, lead handoff): only learners with a
 * confirmed, unrevoked consent to be contacted; everyone else stays an alias
 * (see insights.ts). Where a lead came from is their first course's entry
 * link; a shared certificate in it is looked up for its course alone.
 */

export const LEADS_PER_PAGE = 50;
/** Leads whose details load in one go (the export reads them all, in parts). */
const DETAIL_BATCH = 500;

const isLead = and(
  eq(consents.kind, "lead_handoff"),
  isNotNull(consents.confirmedAt),
  isNull(consents.revokedAt),
);

/** Leads who started (or completed) this course. */
function tookCourse(tx: Transaction, courseId: string): SQL {
  return exists(
    tx
      .select({ one: sql`1` })
      .from(enrollments)
      .where(and(eq(enrollments.userId, consents.userId), eq(enrollments.courseId, courseId))),
  );
}

function leadRows(tx: Transaction, where: SQL | undefined, order: "newest" | "oldest") {
  return tx
    .select({
      userId: consents.userId,
      email: user.email,
      name: learnerProfiles.displayName,
      locale: learnerProfiles.locale,
      wording: consents.wording,
      requestedAt: consents.requestedAt,
      agreedAt: consents.confirmedAt,
    })
    .from(consents)
    .innerJoin(user, eq(user.id, consents.userId))
    .leftJoin(
      learnerProfiles,
      and(
        eq(learnerProfiles.tenantId, consents.tenantId),
        eq(learnerProfiles.userId, consents.userId),
      ),
    )
    .where(where)
    .orderBy(
      order === "newest" ? desc(consents.confirmedAt) : asc(consents.confirmedAt),
      asc(consents.userId),
    )
    .$dynamic();
}

type LeadRow = Awaited<ReturnType<typeof leadRows>>[number];

function group<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  return groups;
}

async function withDetails(tx: Transaction, tenantId: string, rows: LeadRow[]): Promise<Lead[]> {
  const ids = rows.map((row) => row.userId);
  if (ids.length === 0) return [];
  const certificates = await tx
    .select({
      userId: credentials.userId,
      courseId: credentials.courseId,
      title: credentials.courseTitle,
      basis: credentials.basis,
      issuedAt: credentials.issuedAt,
      visibility: credentials.visibility,
    })
    .from(credentials)
    .where(and(inArray(credentials.userId, ids), isNull(credentials.revokedAt)))
    .orderBy(desc(credentials.issuedAt));
  const shares = await tx
    .selectDistinct({
      userId: events.userId,
      courseId: events.courseId,
      target: sql<string | null>`${events.props}->>'target'`,
    })
    .from(events)
    .where(and(eq(events.name, "credential_shared_linkedin"), inArray(events.userId, ids)));
  const started = await tx
    .select({
      userId: enrollments.userId,
      courseId: enrollments.courseId,
      title: courses.title,
      entry: enrollments.entryContext,
      completedAt: enrollments.completedAt,
    })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(inArray(enrollments.userId, ids))
    .orderBy(asc(enrollments.startedAt), asc(enrollments.id));

  const firstCourse = new Map<string, (typeof started)[number]>();
  for (const row of started) if (!firstCourse.has(row.userId)) firstCourse.set(row.userId, row);
  // The entry link names the certificate by its public id (utm_content); only its course comes back.
  const referring = [...firstCourse.values()].flatMap((row) => {
    const utm = row.entry.utm ?? {};
    return fromSharedCredential(utm) && utm.content ? [utm.content] : [];
  });
  const referred = referring.length
    ? await tx
        .select({ publicId: credentials.publicId, title: credentials.courseTitle })
        .from(credentials)
        .where(inArray(credentials.publicId, [...new Set(referring)]))
    : [];
  const courseOf = new Map(referred.map((row) => [row.publicId, row.title]));

  const certificatesOf = group(certificates, (row) => row.userId);
  const sharesOf = group(shares, (row) => `${row.userId}:${row.courseId}`);
  const startedOf = group(started, (row) => row.userId);

  return rows.map((row): Lead => {
    const first = firstCourse.get(row.userId);
    const utm = first?.entry.utm ?? {};
    const completed = (certificatesOf.get(row.userId) ?? []).map((certificate): LeadCourse => ({
      courseId: certificate.courseId,
      title: certificate.title,
      completedAt: certificate.issuedAt,
      basis: certificate.basis,
      visibility: certificate.visibility,
      sharedOn: [
        ...new Set(
          (sharesOf.get(`${row.userId}:${certificate.courseId}`) ?? []).flatMap(
            (share): ShareChannel[] => {
              const channel = shareChannelOf(share.target);
              return channel ? [channel] : [];
            },
          ),
        ),
      ].sort(),
    }));
    return {
      userId: row.userId,
      alias: learnerAlias(tenantId, row.userId),
      name: row.name || null,
      email: row.email,
      locale: row.locale,
      wording: row.wording,
      requestedAt: row.requestedAt,
      agreedAt: row.agreedAt!,
      completed,
      inProgress: (startedOf.get(row.userId) ?? [])
        .filter((enrollment) => !enrollment.completedAt)
        .map((enrollment) => ({ courseId: enrollment.courseId, title: enrollment.title })),
      source: first
        ? {
            utm: {
              ...(utm.source ? { source: utm.source } : {}),
              ...(utm.medium ? { medium: utm.medium } : {}),
              ...(utm.campaign ? { campaign: utm.campaign } : {}),
            },
            viaCertificate: fromSharedCredential(utm)
              ? { courseTitle: (utm.content && courseOf.get(utm.content)) || null }
              : null,
          }
        : null,
    };
  });
}

export interface LeadPage {
  leads: Lead[];
  total: number;
  page: number;
  pages: number;
}

/** Leads for the Studio, newest consent first, a page at a time. */
export async function listLeads(
  db: Database,
  tenantId: string,
  options: { courseId?: string | null; page?: number } = {},
): Promise<LeadPage> {
  return withTenant(db, tenantId, async (tx) => {
    const where = and(isLead, options.courseId ? tookCourse(tx, options.courseId) : undefined);
    const [counted] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(consents)
      .where(where);
    const total = counted?.n ?? 0;
    const pages = Math.max(1, Math.ceil(total / LEADS_PER_PAGE));
    const page = Math.min(Math.max(1, Math.trunc(options.page ?? 1)), pages);
    const rows = await leadRows(tx, where, "newest")
      .limit(LEADS_PER_PAGE)
      .offset((page - 1) * LEADS_PER_PAGE);
    return { leads: await withDetails(tx, tenantId, rows), total, page, pages };
  });
}

/** Every lead, oldest consent first, for the academy's CRM (people/contacts/route.ts). */
export async function exportLeads(
  db: Database,
  tenantId: string,
  options: { courseId?: string | null } = {},
): Promise<Lead[]> {
  return withTenant(db, tenantId, async (tx) => {
    const where = and(isLead, options.courseId ? tookCourse(tx, options.courseId) : undefined);
    const rows = await leadRows(tx, where, "oldest");
    const leads: Lead[] = [];
    for (let start = 0; start < rows.length; start += DETAIL_BATCH) {
      leads.push(...(await withDetails(tx, tenantId, rows.slice(start, start + DETAIL_BATCH))));
    }
    return leads;
  });
}

/** Courses leads started, to filter by. */
export async function leadCourses(
  db: Database,
  tenantId: string,
): Promise<Array<{ id: string; title: LocalizedText }>> {
  return withTenant(db, tenantId, (tx) =>
    tx
      .selectDistinct({ id: courses.id, title: courses.title })
      .from(courses)
      .innerJoin(enrollments, eq(enrollments.courseId, courses.id))
      .innerJoin(
        consents,
        and(
          eq(consents.tenantId, enrollments.tenantId),
          eq(consents.userId, enrollments.userId),
          isLead,
        ),
      ),
  );
}
