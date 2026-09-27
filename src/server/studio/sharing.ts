import { and, eq, gte, isNull, lt, sql, type Column } from "drizzle-orm";

import { summarizeSharing, type SharingSummary } from "@/core/analytics/sharing";
import type { EventName } from "@/core/events/names";
import type { Database } from "@/db/client";
import { consents, credentials, events } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";

/*
 * Sharing numbers for the Studio (brief §14): what learners share, who comes
 * to look, and who comes in through it. Counted per academy (and, for a
 * course page, per course); channels and rates are core/analytics/sharing.
 */

const n = sql<number>`count(*)::int`;
const via = sql<string | null>`${events.props}->>'via'`;
const target = sql<string | null>`${events.props}->>'target'`;
const source = sql<string | null>`${events.utm}->>'source'`;
const medium = sql<string | null>`${events.utm}->>'medium'`;

export async function sharingNumbers(
  db: Database,
  tenantId: string,
  window: { from: Date; to: Date; courseId?: string },
): Promise<SharingSummary> {
  const within = (column: Column) => and(gte(column, window.from), lt(column, window.to));
  const { courseId } = window;
  return withTenant(db, tenantId, async (tx) => {
    const ofEvent = (name: EventName) =>
      and(
        eq(events.name, name),
        within(events.occurredAt),
        courseId ? eq(events.courseId, courseId) : undefined,
      );
    // One transaction = one connection: the counts run one after another.
    // Imported certificates keep the date they were issued elsewhere, so only ours count.
    const [issued] = await tx
      .select({
        issued: n,
        madePublic: sql<number>`(count(*) filter (where ${credentials.madePublicAt} is not null))::int`,
      })
      .from(credentials)
      .where(
        and(
          within(credentials.issuedAt),
          eq(credentials.source, "native"),
          isNull(credentials.revokedAt),
          courseId ? eq(credentials.courseId, courseId) : undefined,
        ),
      );
    const shares = await tx
      .select({ key: target, n })
      .from(events)
      .where(ofEvent("credential_shared_linkedin"))
      .groupBy(target);
    const views = await tx
      .select({ key: via, n })
      .from(events)
      .where(ofEvent("verification_page_viewed"))
      .groupBy(via);
    const clicks = await tx
      .select({ key: via, n })
      .from(events)
      .where(ofEvent("verification_cta_clicked"))
      .groupBy(via);
    // New learners of the academy are sign-ups; a course's are its starts (sign-ups carry no course).
    const entries = await tx
      .select({ source, medium, n })
      .from(events)
      .where(ofEvent(courseId ? "course_started" : "signup_completed"))
      .groupBy(source, medium);
    const [leads] = courseId
      ? [{ n: 0 }]
      : await tx
          .select({ n })
          .from(consents)
          .where(
            and(
              eq(consents.kind, "lead_handoff"),
              within(consents.confirmedAt),
              isNull(consents.revokedAt),
            ),
          );
    return summarizeSharing({
      issued: issued?.issued ?? 0,
      madePublic: issued?.madePublic ?? 0,
      shares,
      views,
      clicks,
      entries,
      newLeads: leads?.n ?? 0,
    });
  });
}
