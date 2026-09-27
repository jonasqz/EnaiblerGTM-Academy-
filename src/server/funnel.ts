import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { FUNNEL_STEPS } from "@/core/events/names";
import type { Transaction } from "@/db/client";
import { events } from "@/db/schema";

export interface FunnelStep {
  key: (typeof FUNNEL_STEPS)[number]["key"];
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
  const names: string[] = FUNNEL_STEPS.flatMap((step) => step.events);
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
    count: step.events.reduce((sum, name) => sum + (counts.get(name) ?? 0), 0),
  }));
}
