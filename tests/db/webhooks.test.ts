import { createHmac } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MAX_WEBHOOKS } from "@/core/webhooks/events";
import type { TenantContext } from "@/core/tenant/context";
import { webhookDeliveries } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import type { PostResult, SafePost } from "@/server/brand/safe-fetch";
import { ensureEnrollment, ensureLearner } from "@/server/learners";
import { deleteMyData, setContactOptIn } from "@/server/profile";
import { createCourse, publishCourse } from "@/server/studio/courses";
import { createLesson, updateLesson } from "@/server/studio/lessons";
import {
  createWebhook,
  deleteWebhook,
  dispatchWebhooks,
  listWebhooks,
  purgeOldDeliveries,
  queueWebhookEvent,
  retryDelivery,
  sendTestWebhook,
  setWebhookEnabled,
} from "@/server/webhooks";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

interface Sent {
  url: string;
  body: string;
  headers: Record<string, string>;
}

/** A receiving side that records what it got and answers as told. */
function receiver(answer: PostResult = { ok: true, status: 204 }) {
  const sent: Sent[] = [];
  const post: SafePost = async (url, input) => {
    sent.push({ url, body: input.body, headers: input.headers });
    return answer;
  };
  return { sent, post };
}

describe.skipIf(!hasDatabase)("webhooks", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let other: TenantContext;
  let admin: string;
  let learner: string;
  let hookId: string;
  let secret: string;

  const deliveries = () =>
    withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(webhookDeliveries).orderBy(webhookDeliveries.createdAt),
    );

  beforeAll(async () => {
    process.env.DATA_ENCRYPTION_SECRET ??= "test-data-encryption-secret-0123456789";
    dbs = await openTestDatabases();
    tenant = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    other = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    admin = await createUser(dbs.owner.db);
    learner = await createUser(dbs.owner.db);
    const courseId = await createCourse(dbs.app.db, tenant.id, {
      languages: ["en"],
      title: "Validation Lab",
      artifactName: "Validated idea brief",
      outcome: "Write a brief.",
      deliveryMode: "free_async",
    });
    const lessonId = await createLesson(dbs.app.db, tenant.id, courseId, {
      locale: "en",
      title: "Interviews",
      userId: admin,
    });
    await updateLesson(dbs.app.db, tenant.id, lessonId, {
      title: "Interviews",
      markdown: "Talk to five people.",
      criterionIds: ["complete", "evidence", "clarity"],
      userId: admin,
    });
    expect((await publishCourse(dbs.app.db, tenant.id, courseId)).ok).toBe(true);
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("queues subscribed events with a pseudonymous learner", async () => {
    const created = await createWebhook(dbs.app.db, tenant.id, {
      url: "https://hooks.example.com/academy",
      events: ["course_started", "contact_consent_given", "contact_consent_withdrawn"],
      createdBy: admin,
    });
    if (!created.ok) throw new Error(created.error);
    ({ id: hookId, secret } = created);
    expect(secret).toMatch(/^whsec_/);

    await withTenant(dbs.app.db, tenant.id, async (tx) => {
      // signup_completed is not subscribed; course_started is.
      await ensureLearner(tx, tenant, learner, { locale: "en", entry: {} });
      await ensureEnrollment(tx, tenant, learner, {
        courseSlug: "validation-lab",
        locale: "en",
        entry: { utm: { source: "linkedin" } },
      });
    });
    const [queued, ...rest] = await deliveries();
    expect(rest).toEqual([]);
    expect(queued).toMatchObject({ event: "course_started", status: "pending", userId: learner });
    const payload = queued!.payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      type: "course_started",
      academy: { slug: tenant.slug },
      course: { slug: "validation-lab" },
      utm: { utm_source: "linkedin" },
    });
    const person = payload.learner as Record<string, string>;
    expect(person.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(person.id).not.toBe(learner);
    expect(person).not.toHaveProperty("email");
    // The secret is stored sealed, never as given.
    const [raw] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.execute(sql`select secret_sealed from webhook_endpoints where id = ${hookId}`),
    ).then((result) => result.rows as Array<{ secret_sealed: string }>);
    expect(raw!.secret_sealed).not.toContain(secret);
  });

  it("signs what it sends, so the receiver can check it", async () => {
    const { sent, post } = receiver();
    expect(await dispatchWebhooks(dbs.app.db, tenant.id, { post })).toEqual({
      delivered: 1,
      failed: 0,
    });
    const [request] = sent;
    expect(request!.url).toBe("https://hooks.example.com/academy");
    expect(request!.headers["x-enaibler-event"]).toBe("course_started");
    const [t, v1] = request!.headers["x-enaibler-signature"]!.split(",");
    const timestamp = t!.replace("t=", "");
    expect(v1).toBe(
      `v1=${createHmac("sha256", secret).update(`${timestamp}.${request!.body}`).digest("hex")}`,
    );
    expect((await deliveries())[0]).toMatchObject({ status: "delivered", attempts: 1 });
    // Nothing left to send.
    expect(await dispatchWebhooks(dbs.app.db, tenant.id, { post })).toEqual({
      delivered: 0,
      failed: 0,
    });
  });

  it("names the learner only once they agreed to be contacted", async () => {
    await setContactOptIn(dbs.app.db, tenant, learner, true, "Yes, contact me.");
    // Saving the same choice again is not news.
    await setContactOptIn(dbs.app.db, tenant, learner, true, "Yes, contact me.");
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      queueWebhookEvent(tx, { tenantId: tenant.id, type: "course_started", userId: learner }),
    );
    const rows = (await deliveries()).slice(1);
    expect(rows.map((row) => row.event)).toEqual(["contact_consent_given", "course_started"]);
    const email = `${learner}@learners.test`;
    for (const row of rows) {
      expect((row.payload as { learner: { email?: string } }).learner.email).toBe(email);
    }
    // Same pseudonym in every event, so a CRM can match them.
    const ids = new Set(
      (await deliveries()).map((row) => (row.payload as { learner: { id: string } }).learner.id),
    );
    expect(ids.size).toBe(1);

    await setContactOptIn(dbs.app.db, tenant, learner, false, "");
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      queueWebhookEvent(tx, { tenantId: tenant.id, type: "course_started", userId: learner }),
    );
    const [withdrawn, after] = (await deliveries()).slice(3);
    expect(withdrawn!.event).toBe("contact_consent_withdrawn");
    expect((withdrawn!.payload as { learner: { email?: string } }).learner.email).toBe(email);
    expect((after!.payload as { learner: { email?: string } }).learner).not.toHaveProperty("email");
    const { post } = receiver();
    expect((await dispatchWebhooks(dbs.app.db, tenant.id, { post })).delivered).toBe(4);
  });

  it("retries with backoff, gives up, and can send again", async () => {
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      queueWebhookEvent(tx, { tenantId: tenant.id, type: "course_started", userId: learner }),
    );
    const down = receiver({ ok: false, reason: "status", status: 503 });
    expect(await dispatchWebhooks(dbs.app.db, tenant.id, { post: down.post })).toEqual({
      delivered: 0,
      failed: 1,
    });
    const pending = (await deliveries()).at(-1)!;
    expect(pending).toMatchObject({ status: "pending", attempts: 1, lastResult: "503" });
    expect(pending.nextAttemptAt.getTime() - Date.now()).toBeGreaterThan(50_000);
    // Not due yet.
    expect((await dispatchWebhooks(dbs.app.db, tenant.id, { post: down.post })).failed).toBe(0);

    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .update(webhookDeliveries)
        .set({ attempts: 7, nextAttemptAt: new Date(Date.now() - 1000) })
        .where(eq(webhookDeliveries.id, pending.id)),
    );
    await dispatchWebhooks(dbs.app.db, tenant.id, { post: down.post });
    expect((await deliveries()).at(-1)).toMatchObject({ status: "failed", attempts: 8 });

    expect(await retryDelivery(dbs.app.db, tenant.id, pending.id)).toBe(true);
    const up = receiver();
    expect((await dispatchWebhooks(dbs.app.db, tenant.id, { post: up.post })).delivered).toBe(1);
    expect((await deliveries()).at(-1)).toMatchObject({ status: "delivered", attempts: 1 });
  });

  it("tries a failing endpoint once per round and still serves the others", async () => {
    const second = await createWebhook(dbs.app.db, tenant.id, {
      url: "https://crm.example.com/hooks",
      events: ["course_started"],
      createdBy: admin,
    });
    if (!second.ok) throw new Error(second.error);
    for (let i = 0; i < 3; i++) {
      await withTenant(dbs.app.db, tenant.id, (tx) =>
        queueWebhookEvent(tx, { tenantId: tenant.id, type: "course_started", userId: learner }),
      );
    }
    const sent: string[] = [];
    const post: SafePost = async (url) => {
      sent.push(url);
      return url.includes("hooks.example.com")
        ? { ok: false, reason: "unreachable" }
        : { ok: true, status: 200 };
    };
    expect(await dispatchWebhooks(dbs.app.db, tenant.id, { post })).toEqual({
      delivered: 3,
      failed: 1,
    });
    expect(sent.filter((url) => url.includes("hooks.example.com"))).toHaveLength(1);
    await deleteWebhook(dbs.app.db, tenant.id, second.id);
    // What is left for the first endpoint goes out once it answers again.
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .update(webhookDeliveries)
        .set({ nextAttemptAt: new Date(Date.now() - 1000) })
        .where(eq(webhookDeliveries.status, "pending")),
    );
    expect(
      (await dispatchWebhooks(dbs.app.db, tenant.id, { post: receiver().post })).delivered,
    ).toBe(3);
  });

  it("holds deliveries while paused and tests right away", async () => {
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      queueWebhookEvent(tx, { tenantId: tenant.id, type: "course_started", userId: learner }),
    );
    await setWebhookEnabled(dbs.app.db, tenant.id, hookId, false);
    const count = (await deliveries()).length;
    // Paused endpoints get no new deliveries; the waiting one is kept as failed.
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      queueWebhookEvent(tx, { tenantId: tenant.id, type: "course_started", userId: learner }),
    );
    expect(await deliveries()).toHaveLength(count);
    const { sent, post } = receiver();
    await dispatchWebhooks(dbs.app.db, tenant.id, { post });
    expect(sent).toEqual([]);
    expect((await deliveries()).at(-1)).toMatchObject({ status: "failed", lastResult: "paused" });

    // A test goes out even while paused, and says what came back.
    expect(await sendTestWebhook(dbs.app.db, tenant.id, hookId, { post })).toEqual({
      delivered: true,
      result: "204",
    });
    expect(JSON.parse(sent[0]!.body)).toMatchObject({
      type: "ping",
      academy: { slug: tenant.slug },
    });
    const down = receiver({ ok: false, reason: "unreachable" });
    expect(await sendTestWebhook(dbs.app.db, tenant.id, hookId, { post: down.post })).toEqual({
      delivered: false,
      result: "unreachable",
    });
    // A failed test is not retried.
    expect((await deliveries()).at(-1)).toMatchObject({ event: "ping", status: "failed" });
    const [listed] = await listWebhooks(dbs.app.db, tenant.id);
    expect(listed).toMatchObject({ enabled: false, lastResult: "unreachable" });
    expect(listed!.recent[0]).toMatchObject({ event: "ping", status: "failed" });
  });

  it("keeps each academy's webhooks to itself", async () => {
    expect(await listWebhooks(dbs.app.db, other.id)).toEqual([]);
    expect(await sendTestWebhook(dbs.app.db, other.id, hookId)).toBeNull();
    await deleteWebhook(dbs.app.db, other.id, hookId);
    expect(await listWebhooks(dbs.app.db, tenant.id)).toHaveLength(1);

    for (let i = 1; i < MAX_WEBHOOKS; i++) {
      const created = await createWebhook(dbs.app.db, tenant.id, {
        url: `https://hooks.example.com/${i}`,
        events: ["course_completed"],
        createdBy: admin,
      });
      expect(created.ok).toBe(true);
    }
    expect(
      await createWebhook(dbs.app.db, tenant.id, {
        url: "https://hooks.example.com/one-too-many",
        events: ["course_completed"],
        createdBy: admin,
      }),
    ).toEqual({ ok: false, error: "limit" });
  });

  it("forgets deliveries after 30 days and with the learner's data", async () => {
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .update(webhookDeliveries)
        .set({ createdAt: sql`now() - interval '31 days'` })
        .where(eq(webhookDeliveries.event, "ping")),
    );
    expect(await purgeOldDeliveries(dbs.app.db, tenant.id)).toBe(2);
    expect((await deliveries()).some((row) => row.event === "ping")).toBe(false);

    await deleteMyData(dbs.app.db, tenant, learner);
    expect(await deliveries()).toEqual([]);
    await deleteWebhook(dbs.app.db, tenant.id, hookId);
    expect(await listWebhooks(dbs.app.db, tenant.id)).toHaveLength(MAX_WEBHOOKS - 1);
  });
});
