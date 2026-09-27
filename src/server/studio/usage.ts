import { and, eq, gte, lt, sql, type AnyColumn } from "drizzle-orm";

import { localize, type Locale } from "@/core/i18n/locales";
import {
  AI_USAGE_KINDS,
  emptyTotals,
  monthRange,
  recentMonths,
  USAGE_TIME_ZONE,
  type AiUsageKind,
  type KindUsage,
} from "@/core/usage/ai-usage";
import type { Database, Transaction } from "@/db/client";
import { aiUsage, courses } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";

/*
 * What an academy used of the AI in a month (core/usage/ai-usage), added up
 * in SQL. Read by Studio → Settings → Usage and by the operator's report
 * (scripts/usage-report.ts), hence no "server-only" here.
 */

/** The calls for one hand-in, run, source or draft count once; a call without a reference on its own. */
const distinctItems = () =>
  sql<number>`count(distinct coalesce(${aiUsage.refId}, ${aiUsage.id}))::int`;

const total = (column: AnyColumn) => sql`coalesce(sum(${column}), 0)`.mapWith(Number);

const during = (range: { from: Date; to: Date }) =>
  and(gte(aiUsage.createdAt, range.from), lt(aiUsage.createdAt, range.to));

async function totalsByKind(tx: Transaction, month: string): Promise<KindUsage[]> {
  return tx
    .select({
      kind: aiUsage.kind,
      items: distinctItems(),
      calls: total(aiUsage.calls),
      tokensIn: total(aiUsage.tokensIn),
      tokensOut: total(aiUsage.tokensOut),
      audioSeconds: total(aiUsage.audioSeconds),
      costMicroUsd: total(aiUsage.costMicroUsd),
      costIncomplete: sql<boolean>`bool_or(${aiUsage.costMicroUsd} is null)`,
    })
    .from(aiUsage)
    .where(during(monthRange(month)))
    .groupBy(aiUsage.kind);
}

/** One academy's month by kind; kinds it did not use are left out. */
export async function usageByKind(
  db: Database,
  tenantId: string,
  month: string,
): Promise<KindUsage[]> {
  return withTenant(db, tenantId, (tx) => totalsByKind(tx, month));
}

export interface CourseReviews {
  /** Null for courses deleted since: their reviews are counted together. */
  courseId: string | null;
  title: string | null;
  reviews: number;
}

export interface StudioUsage {
  month: string;
  /** Every kind, used or not. */
  kinds: Record<AiUsageKind, KindUsage>;
  /** Hand-ins the AI reviewed, by course: the most first, deleted courses last. */
  byCourse: CourseReviews[];
  /** Hand-ins the AI reviewed per month, the oldest first, ending with `month`. */
  history: Array<{ month: string; reviews: number }>;
}

export const USAGE_HISTORY_MONTHS = 6;

export async function studioUsage(
  db: Database,
  tenant: { id: string; settings: { default_locale: Locale } },
  month: string,
): Promise<StudioUsage> {
  const months = recentMonths(month, USAGE_HISTORY_MONTHS).reverse();
  return withTenant(db, tenant.id, async (tx) => {
    const totals = await totalsByKind(tx, month);
    const perCourse = await tx
      .select({ courseId: courses.id, title: courses.title, reviews: distinctItems() })
      .from(aiUsage)
      .leftJoin(courses, eq(courses.id, aiUsage.courseId))
      .where(and(eq(aiUsage.kind, "review"), during(monthRange(month))))
      .groupBy(courses.id);
    // Grouped by position: the time zone is a parameter, which Postgres cannot match in GROUP BY.
    const perMonth = await tx
      .select({
        month: sql<string>`to_char(${aiUsage.createdAt} at time zone ${USAGE_TIME_ZONE}, 'YYYY-MM')`,
        reviews: distinctItems(),
      })
      .from(aiUsage)
      .where(
        and(
          eq(aiUsage.kind, "review"),
          during({ from: monthRange(months[0]!).from, to: monthRange(month).to }),
        ),
      )
      .groupBy(sql`1`);

    const reviewsIn = new Map(perMonth.map((row) => [row.month, row.reviews]));
    return {
      month,
      kinds: Object.fromEntries(
        AI_USAGE_KINDS.map((kind) => [
          kind,
          totals.find((row) => row.kind === kind) ?? { kind, items: 0, ...emptyTotals() },
        ]),
      ) as Record<AiUsageKind, KindUsage>,
      byCourse: perCourse
        .map((row) => ({
          courseId: row.courseId,
          title: row.title ? localize(row.title, tenant.settings.default_locale) : null,
          reviews: row.reviews,
        }))
        .sort(
          (a, b) =>
            Number(a.courseId === null) - Number(b.courseId === null) ||
            b.reviews - a.reviews ||
            (a.title ?? "").localeCompare(b.title ?? ""),
        ),
      history: months.map((value) => ({ month: value, reviews: reviewsIn.get(value) ?? 0 })),
    };
  });
}
