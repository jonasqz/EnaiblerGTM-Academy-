import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { FUNNEL_STEPS } from "@/core/events/names";
import type { Transaction } from "@/db/client";
import { events } from "@/db/schema";

export interface FunnelStep {
  key: (typeof FUNNEL_STEPS)[number]["key"];
  event: (typeof FUNNEL_STEPS)[number]["event"];
  count: number;
}

/**
 * Tenant funnel (brief §10, MVP-light): entry → start → submit → pass →
 * public → shared → verification views → CTA clicks. Counts events in the
 * window; run inside withTenant so RLS scopes it to one academy.
 */
export async function loadFunnel(
  tx: Transaction,
  options: { from: Date; to: Date; courseId?: string },
): Promise<FunnelStep[]> {
  const names = FUNNEL_STEPS.map((step) => step.event);
  const rows = await tx
    .select({ name: events.name, count: sql<number>`count(*)::int` })
    .from(events)
    .where(
      and(
        inArray(events.name, names),
        gte(events.occurredAt, options.from),
        lt(events.occurredAt, options.to),
        options.courseId ? eq(events.courseId, options.courseId) : undefined,
      ),
    )
    .groupBy(events.name);
  const counts = new Map(rows.map((row) => [row.name, row.count]));
  return FUNNEL_STEPS.map((step) => ({
    key: step.key,
    event: step.event,
    count: counts.get(step.event) ?? 0,
  }));
}
