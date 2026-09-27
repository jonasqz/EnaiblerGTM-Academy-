import { createHmac, randomBytes, randomUUID } from "node:crypto";

import { and, asc, desc, eq, isNotNull, isNull, lt, lte, ne, notInArray, sql } from "drizzle-orm";

import type { UtmKey } from "@/core/entry/context";
import {
  carriesEmail,
  isWebhookEvent,
  MAX_DELIVERY_ATTEMPTS,
  MAX_WEBHOOKS,
  nextAttemptDelayMinutes,
  type WebhookEvent,
} from "@/core/webhooks/events";
import type { Database, Queryable, Transaction } from "@/db/client";
import {
  consents,
  courses,
  learnerProfiles,
  paths,
  tenants,
  user,
  webhookDeliveries,
  webhookEndpoints,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { safePost, type SafePost } from "@/server/brand/safe-fetch";
import { openSecret, pseudonymUuid, sealSecret } from "@/server/secrets";

/*
 * Outbound webhooks (brief §10, phase 2). Deliveries are written in the
 * transaction of the event they report, so a rolled-back action never fires
 * one, and sent by the worker with retries. Learners are a stable pseudonym;
 * their e-mail and name only go out with their consent to be contacted
 * (brief §9, lead handoff) or in the consent event itself.
 */

export interface WebhookEventInput {
  tenantId: string;
  type: WebhookEvent;
  userId?: string | null;
  courseId?: string | null;
  pathId?: string | null;
  locale?: string | null;
  utm?: Partial<Record<UtmKey, string>>;
  props?: Record<string, unknown>;
}

async function academyOf(tx: Queryable, tenantId: string) {
  const [academy] = await tx
    .select({ slug: tenants.slug, config: tenants.config })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  return { slug: academy?.slug, name: academy?.config.author_display_name };
}

/** Queues the event for every endpoint that wants it. Call inside the event's tenant transaction. */
export async function queueWebhookEvent(tx: Queryable, event: WebhookEventInput): Promise<void> {
  if (!isWebhookEvent(event.type)) return;
  const endpoints = (
    await tx
      .select({ id: webhookEndpoints.id, events: webhookEndpoints.events })
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.enabled, true))
  ).filter((endpoint) => endpoint.events.includes(event.type));
  if (endpoints.length === 0) return;

  const payload: Record<string, unknown> = {
    id: randomUUID(),
    type: event.type,
    created_at: new Date().toISOString(),
    academy: await academyOf(tx, event.tenantId),
  };
  if (event.userId) {
    const [handoff] = await tx
      .select({ id: consents.id })
      .from(consents)
      .where(
        and(
          eq(consents.userId, event.userId),
          eq(consents.kind, "lead_handoff"),
          isNotNull(consents.confirmedAt),
          isNull(consents.revokedAt),
        ),
      );
    const learner: Record<string, unknown> = {
      id: pseudonymUuid("webhook-learner", event.tenantId, event.userId),
    };
    if (carriesEmail(event.type, Boolean(handoff))) {
      const [person] = await tx
        .select({ email: user.email, name: learnerProfiles.displayName })
        .from(user)
        .leftJoin(
          learnerProfiles,
          and(eq(learnerProfiles.userId, user.id), eq(learnerProfiles.tenantId, event.tenantId)),
        )
        .where(eq(user.id, event.userId));
      learner.email = person?.email;
      if (person?.name) learner.name = person.name;
    }
    payload.learner = learner;
  }
  if (event.courseId) {
    const [course] = await tx
      .select({ slug: courses.slug })
      .from(courses)
      .where(eq(courses.id, event.courseId));
    payload.course = { id: event.courseId, slug: course?.slug };
  }
  if (event.pathId) {
    const [path] = await tx
      .select({ slug: paths.slug })
      .from(paths)
      .where(eq(paths.id, event.pathId));
    payload.path = { id: event.pathId, slug: path?.slug };
  }
  if (event.locale) payload.locale = event.locale;
  if (event.utm && Object.keys(event.utm).length > 0) {
    // Named as in the entry link, which is what marketing tools expect.
    payload.utm = Object.fromEntries(
      Object.entries(event.utm).map(([key, value]) => [`utm_${key}`, value]),
    );
  }
  if (event.props && Object.keys(event.props).length > 0) payload.data = event.props;

  await tx.insert(webhookDeliveries).values(
    endpoints.map((endpoint) => ({
      tenantId: event.tenantId,
      endpointId: endpoint.id,
      userId: event.userId ?? null,
      event: event.type,
      payload,
    })),
  );
}

/** "t=<unix seconds>,v1=<hex HMAC-SHA256 of '<t>.<body>'>" (verify with the endpoint's secret). */
export function webhookSignature(secret: string, timestamp: number, body: string): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

export interface DispatchWebhooksResult {
  delivered: number;
  failed: number;
}

type DeliveryRow = typeof webhookDeliveries.$inferSelect;
type EndpointRow = typeof webhookEndpoints.$inferSelect;

/** One attempt at a delivery the caller has locked. Without `retry` a failure is final. */
async function attempt(
  tx: Transaction,
  delivery: DeliveryRow,
  endpoint: EndpointRow,
  post: SafePost,
  options: { retry: boolean },
): Promise<{ delivered: boolean; result: string }> {
  const now = new Date();
  const attempts = delivery.attempts + 1;
  const body = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(now.getTime() / 1000);
  const sent = await post(endpoint.url, {
    body,
    headers: {
      "content-type": "application/json",
      "x-enaibler-event": delivery.event,
      "x-enaibler-delivery": delivery.id,
      "x-enaibler-signature": webhookSignature(openSecret(endpoint.secretSealed), timestamp, body),
    },
  });
  const lastResult = sent.ok ? String(sent.status) : (sent.status?.toString() ?? sent.reason);
  await tx
    .update(webhookEndpoints)
    .set({ lastDeliveryAt: now, lastResult })
    .where(eq(webhookEndpoints.id, endpoint.id));
  if (sent.ok) {
    await tx
      .update(webhookDeliveries)
      .set({ status: "delivered", attempts, lastResult, deliveredAt: now })
      .where(eq(webhookDeliveries.id, delivery.id));
    return { delivered: true, result: lastResult };
  }
  await tx
    .update(webhookDeliveries)
    .set(
      !options.retry || attempts >= MAX_DELIVERY_ATTEMPTS
        ? { status: "failed", attempts, lastResult }
        : {
            attempts,
            lastResult,
            nextAttemptAt: new Date(now.getTime() + nextAttemptDelayMinutes(attempts) * 60_000),
          },
    )
    .where(eq(webhookDeliveries.id, delivery.id));
  return { delivered: false, result: lastResult };
}

/**
 * Sends one academy's due deliveries, each locked (SKIP LOCKED) while it is
 * on its way. An endpoint that fails is not tried again in the same round,
 * and a round stops after its time budget: a slow endpoint must not hold up
 * the others, or other academies.
 */
export async function dispatchWebhooks(
  db: Database,
  tenantId: string,
  deps: { post?: SafePost; limit?: number; budgetMs?: number } = {},
): Promise<DispatchWebhooksResult> {
  const post = deps.post ?? safePost;
  const deadline = Date.now() + (deps.budgetMs ?? 60_000);
  const result = { delivered: 0, failed: 0 };
  const failing = new Set<string>();
  for (let i = 0; i < (deps.limit ?? 50) && Date.now() < deadline; i++) {
    const outcome = await withTenant(db, tenantId, async (tx) => {
      const [delivery] = await tx
        .select()
        .from(webhookDeliveries)
        .where(
          and(
            eq(webhookDeliveries.status, "pending"),
            lte(webhookDeliveries.nextAttemptAt, new Date()),
            failing.size > 0 ? notInArray(webhookDeliveries.endpointId, [...failing]) : undefined,
          ),
        )
        .orderBy(asc(webhookDeliveries.nextAttemptAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!delivery) return null;
      const [endpoint] = await tx
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.id, delivery.endpointId));
      if (!endpoint?.enabled) {
        // Paused while this waited: kept as failed, so it can be sent again after resuming.
        await tx
          .update(webhookDeliveries)
          .set({ status: "failed", lastResult: "paused" })
          .where(eq(webhookDeliveries.id, delivery.id));
        return "failed" as const;
      }
      const sent = await attempt(tx, delivery, endpoint, post, { retry: true });
      if (!sent.delivered) failing.add(endpoint.id);
      return sent.delivered ? ("delivered" as const) : ("failed" as const);
    });
    if (!outcome) break;
    result[outcome]++;
  }
  return result;
}

export async function createWebhook(
  db: Database,
  tenantId: string,
  input: { url: string; events: WebhookEvent[]; createdBy: string },
): Promise<{ ok: true; id: string; secret: string } | { ok: false; error: "limit" }> {
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  return withTenant(db, tenantId, async (tx) => {
    const [{ count }] = (await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(webhookEndpoints)) as [{ count: number }];
    if (count >= MAX_WEBHOOKS) return { ok: false, error: "limit" } as const;
    const [row] = await tx
      .insert(webhookEndpoints)
      .values({
        tenantId,
        url: input.url.trim(),
        events: input.events,
        secretSealed: sealSecret(secret),
        createdBy: input.createdBy,
      })
      .returning({ id: webhookEndpoints.id });
    return { ok: true, id: row!.id, secret } as const;
  });
}

export async function listWebhooks(db: Database, tenantId: string) {
  return withTenant(db, tenantId, async (tx) => {
    const endpoints = await tx
      .select({
        id: webhookEndpoints.id,
        url: webhookEndpoints.url,
        events: webhookEndpoints.events,
        enabled: webhookEndpoints.enabled,
        lastDeliveryAt: webhookEndpoints.lastDeliveryAt,
        lastResult: webhookEndpoints.lastResult,
        createdAt: webhookEndpoints.createdAt,
      })
      .from(webhookEndpoints)
      .orderBy(asc(webhookEndpoints.createdAt));
    const withRecent = [];
    for (const endpoint of endpoints) {
      const recent = await tx
        .select({
          id: webhookDeliveries.id,
          event: webhookDeliveries.event,
          status: webhookDeliveries.status,
          attempts: webhookDeliveries.attempts,
          lastResult: webhookDeliveries.lastResult,
          nextAttemptAt: webhookDeliveries.nextAttemptAt,
          createdAt: webhookDeliveries.createdAt,
        })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.endpointId, endpoint.id))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(5);
      withRecent.push({ ...endpoint, recent });
    }
    return withRecent;
  });
}

export type StudioWebhook = Awaited<ReturnType<typeof listWebhooks>>[number];

export async function setWebhookEnabled(
  db: Database,
  tenantId: string,
  id: string,
  enabled: boolean,
): Promise<void> {
  await withTenant(db, tenantId, (tx) =>
    tx.update(webhookEndpoints).set({ enabled }).where(eq(webhookEndpoints.id, id)),
  );
}

export async function deleteWebhook(db: Database, tenantId: string, id: string): Promise<void> {
  await withTenant(db, tenantId, (tx) =>
    tx.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id)),
  );
}

/** A "ping" sent right away (paused or not), so whoever sets up the receiving side sees the answer. */
export async function sendTestWebhook(
  db: Database,
  tenantId: string,
  id: string,
  deps: { post?: SafePost } = {},
): Promise<{ delivered: boolean; result: string } | null> {
  return withTenant(db, tenantId, async (tx) => {
    const [endpoint] = await tx.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, id));
    if (!endpoint) return null;
    const [delivery] = await tx
      .insert(webhookDeliveries)
      .values({
        tenantId,
        endpointId: endpoint.id,
        event: "ping",
        payload: {
          id: randomUUID(),
          type: "ping",
          created_at: new Date().toISOString(),
          academy: await academyOf(tx, tenantId),
        },
      })
      .returning();
    return attempt(tx, delivery!, endpoint, deps.post ?? safePost, { retry: false });
  });
}

/** Sends a given-up delivery again, e.g. after the receiving side was fixed or resumed. */
export async function retryDelivery(
  db: Database,
  tenantId: string,
  deliveryId: string,
): Promise<boolean> {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .update(webhookDeliveries)
      .set({ status: "pending", attempts: 0, nextAttemptAt: new Date(), lastResult: null })
      .where(
        and(
          eq(webhookDeliveries.id, deliveryId),
          eq(webhookDeliveries.status, "failed"),
          ne(webhookDeliveries.event, "ping"),
        ),
      )
      .returning({ id: webhookDeliveries.id }),
  );
  return rows.length > 0;
}

/** Sent and given-up deliveries go after 30 days: they hold learner data. */
export async function purgeOldDeliveries(db: Database, tenantId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const removed = await withTenant(db, tenantId, (tx) =>
    tx
      .delete(webhookDeliveries)
      .where(
        and(sql`${webhookDeliveries.status} <> 'pending'`, lt(webhookDeliveries.createdAt, cutoff)),
      )
      .returning({ id: webhookDeliveries.id }),
  );
  return removed.length;
}
