/**
 * Worker container: `npm run worker` (dev) / `node --import tsx src/worker/index.ts`.
 * Same repo and image as the web app, different command (brief §11).
 */
import { eq } from "drizzle-orm";
import { PgBoss, type Job } from "pg-boss";

import { createDatabase, assertRlsEnforced } from "@/db/client";
import { tenants } from "@/db/schema";
import { findTenantById } from "@/db/tenants";
import { allowanceConfig } from "@/server/ai-allowance";
import { runLessonDraft } from "@/server/authoring/lesson-drafting";
import { authoringModel } from "@/server/authoring/model";
import { extractKeyframes, transcribeRecording } from "@/server/authoring/recordings";
import { extractSource, recheckDueSources } from "@/server/authoring/sources";
import { embeddingConfig, whisperConfig } from "@/server/authoring/speech";
import { checkOpenClaims } from "@/server/domains/claims";
import { systemDns } from "@/server/domains/dns";
import { sendEmail } from "@/server/email/mailer";
import { cleanupPendingFiles } from "@/server/files";
import { QUEUE_OPTIONS, QUEUES, type JobPayloads, type QueueName } from "@/server/jobs/queues";
import { createLlmCaller } from "@/server/llm";
import { dispatchNotifications, purgeProcessedNotifications } from "@/server/notifications";
import { log } from "@/server/observability/log";
import { reportError } from "@/server/observability/report";
import { runCalibration } from "@/server/review/calibration";
import { processSubmission } from "@/server/review/process-submission";
import { purgeExpiredSignIns } from "@/server/sessions";
import { storageConfigured } from "@/server/storage";
import { dispatchWebhooks, purgeOldDeliveries } from "@/server/webhooks";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  log.error("DATABASE_URL is not set", { runtime: "worker" });
  process.exit(1);
}

// Every model call checks the academy's AI allowance: a mistyped amount stops the worker here.
try {
  if (allowanceConfig().defaultMicroUsd === null) {
    log.warn(
      "AI_MONTHLY_ALLOWANCE_USD is not set: academies without their own allowance have no limit",
    );
  }
} catch (error) {
  log.error(error instanceof Error ? error.message : String(error), { runtime: "worker" });
  process.exit(1);
}

process.on("unhandledRejection", (reason) => {
  void reportError(reason, { runtime: "worker", extra: { kind: "unhandledRejection" } });
});

const { db, pool } = createDatabase(connectionString, { max: 4 });
await assertRlsEnforced(db);

// The pgboss schema is created by deploy/postgres/init.sh (owned by the app role),
// so pg-boss only migrates its tables and never needs CREATE on the database.
const boss = new PgBoss({ connectionString, schema: "pgboss", createSchema: false });
boss.on("error", (error) => void reportError(error, { runtime: "worker", queue: "pg-boss" }));
await boss.start();

// Queues must exist before anyone can send to them; createQueue is idempotent.
for (const [name, options] of Object.entries(QUEUE_OPTIONS) as Array<
  [QueueName, (typeof QUEUE_OPTIONS)[QueueName]]
>) {
  await boss.createQueue(name, options);
}

/** A failed job is reported, then retried by pg-boss as its queue says. */
function reported<T>(queue: QueueName, handler: (jobs: Job<T>[]) => Promise<void>) {
  return async (jobs: Job<T>[]) => {
    try {
      await handler(jobs);
    } catch (error) {
      const job = jobs[0];
      await reportError(error, {
        runtime: "worker",
        queue,
        extra: {
          tenantId: (job?.data as { tenantId?: string } | undefined)?.tenantId,
          jobId: job?.id,
          retry: job?.retryCount,
        },
      });
      throw error;
    }
  };
}

/** Rounds over every academy: one academy's failure must not stop the others. */
async function forEachTenant(
  queue: QueueName,
  options: { activeOnly: boolean },
  run: (tenant: { id: string; slug: string }) => Promise<void>,
): Promise<void> {
  const rows = await db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .where(options.activeOnly ? eq(tenants.status, "active") : undefined);
  for (const tenant of rows) {
    try {
      await run(tenant);
    } catch (error) {
      await reportError(error, { runtime: "worker", queue, tenant: tenant.slug });
    }
  }
}

// Learner mail (review ready, level-up), every minute for every active academy.
await boss.work(
  QUEUES.notifications,
  reported(QUEUES.notifications, () =>
    forEachTenant(QUEUES.notifications, { activeOnly: true }, async ({ id }) => {
      const tenant = await findTenantById(db, id);
      if (!tenant) return;
      const result = await dispatchNotifications(db, tenant, { send: sendEmail });
      if (result.sent + result.failed > 0)
        log.info("mail sent", { tenant: tenant.slug, ...result });
    }),
  ),
);
await boss.schedule(QUEUES.notifications, "* * * * *");

// Webhooks (brief §10): queued with the event, sent here with retries.
await boss.work(
  QUEUES.webhooks,
  reported(QUEUES.webhooks, () =>
    forEachTenant(QUEUES.webhooks, { activeOnly: true }, async (tenant) => {
      const result = await dispatchWebhooks(db, tenant.id);
      if (result.delivered + result.failed > 0) {
        log.info("webhooks sent", { tenant: tenant.slug, ...result });
      }
    }),
  ),
);
await boss.schedule(QUEUES.webhooks, "* * * * *");

// Retention: delivery logs hold learner data, sent mail only needs to be traceable for a while,
// and sessions that ran out still hold an IP address.
await boss.work(
  QUEUES.housekeeping,
  reported(QUEUES.housekeeping, async () => {
    await forEachTenant(QUEUES.housekeeping, { activeOnly: false }, async (tenant) => {
      const deliveries = await purgeOldDeliveries(db, tenant.id);
      const mails = await purgeProcessedNotifications(db, tenant.id);
      if (deliveries + mails > 0) {
        log.info("housekeeping", { tenant: tenant.slug, deliveries, mails });
      }
    });
    // Sessions and sign-in links are global rows: once per run, not per academy.
    const signIns = await purgeExpiredSignIns(db);
    if (signIns.sessions + signIns.links > 0) log.info("housekeeping", signIns);
  }),
);
await boss.schedule(QUEUES.housekeeping, "41 3 * * *");

// Auto-update (brief §7): web pages lessons were written from, read again once a day.
await boss.work(
  QUEUES.sourcesRecheck,
  reported(QUEUES.sourcesRecheck, () =>
    forEachTenant(QUEUES.sourcesRecheck, { activeOnly: true }, async (tenant) => {
      const result = await recheckDueSources(db, tenant.id);
      if (result.changed + result.failed > 0) {
        log.info("sources checked", { tenant: tenant.slug, ...result });
      }
    }),
  ),
);
await boss.schedule(QUEUES.sourcesRecheck, "23 4 * * *");

// Custom domains waiting for DNS: they go live without anyone pressing "check".
await boss.work(
  QUEUES.domainsCheck,
  reported(QUEUES.domainsCheck, async () => {
    const verified = await checkOpenClaims(db, systemDns);
    if (verified > 0) log.info("custom domains verified", { verified });
  }),
);
await boss.schedule(QUEUES.domainsCheck, "*/10 * * * *");

// Without a gateway every submission goes to the human queue ("ai_unavailable").
const llm = process.env.LLM_BASE_URL
  ? createLlmCaller({ baseUrl: process.env.LLM_BASE_URL, apiKey: process.env.LLM_API_KEY })
  : null;
const reviewModel = process.env.LLM_REVIEW_MODEL || "review-default";
const reviewRetries = QUEUE_OPTIONS[QUEUES.review].retryLimit ?? 0;
if (!llm) log.warn("LLM_BASE_URL is not set: submissions wait for a human review");

await boss.work(
  QUEUES.review,
  { batchSize: 1 },
  reported(QUEUES.review, async (jobs: Job<JobPayloads["review.run"]>[]) => {
    for (const job of jobs) {
      // On the last try a gateway failure holds the submission for a human
      // instead of failing the job, so no learner waits on a dead job.
      const outcome = await processSubmission(
        db,
        job.data,
        { llm, model: reviewModel },
        { finalAttempt: job.retryCount >= reviewRetries },
      );
      log.info("review", { submissionId: job.data.submissionId, status: outcome.status });
    }
  }),
);

// Abandoned uploads (a hand-in form that was never sent), once a day per academy.
await boss.work(
  QUEUES.filesCleanup,
  reported(QUEUES.filesCleanup, async () => {
    if (!storageConfigured()) return;
    const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
    await forEachTenant(QUEUES.filesCleanup, { activeOnly: false }, async (tenant) => {
      const removed = await cleanupPendingFiles(db, tenant.id, cutoff);
      if (removed > 0) log.info("unclaimed uploads removed", { tenant: tenant.slug, removed });
    });
  }),
);
await boss.schedule(QUEUES.filesCleanup, "17 3 * * *");

// Authoring (brief §7): sources become text, recordings become topics with
// screenshots, and lessons are drafted backwards from the rubric.
const finalTry = (job: Job<unknown>, queue: QueueName) =>
  job.retryCount >= (QUEUE_OPTIONS[queue].retryLimit ?? 0);

await boss.work(
  QUEUES.sourcesExtract,
  { batchSize: 1 },
  reported(QUEUES.sourcesExtract, async (jobs: Job<JobPayloads["sources.extract"]>[]) => {
    for (const job of jobs) {
      await extractSource(db, job.data.tenantId, job.data.sourceId, {
        finalAttempt: finalTry(job, QUEUES.sourcesExtract),
      });
    }
  }),
);
await boss.work(
  QUEUES.transcription,
  { batchSize: 1 },
  reported(QUEUES.transcription, async (jobs: Job<JobPayloads["transcription.run"]>[]) => {
    for (const job of jobs) {
      await transcribeRecording(db, job.data.tenantId, job.data.sourceId, {
        whisper: whisperConfig(),
        model: authoringModel(),
        next: async (name, data) => {
          await boss.send(name, data);
        },
        finalAttempt: finalTry(job, QUEUES.transcription),
      });
    }
  }),
);
await boss.work(
  QUEUES.keyframes,
  { batchSize: 1 },
  reported(QUEUES.keyframes, async (jobs: Job<JobPayloads["keyframes.extract"]>[]) => {
    for (const job of jobs) await extractKeyframes(db, job.data.tenantId, job.data.sourceId);
  }),
);
await boss.work(
  QUEUES.lessonDraft,
  { batchSize: 1 },
  reported(QUEUES.lessonDraft, async (jobs: Job<JobPayloads["lessons.draft"]>[]) => {
    for (const job of jobs) {
      await runLessonDraft(db, job.data.tenantId, job.data.draftId, {
        model: authoringModel(),
        embeddings: embeddingConfig(),
        finalAttempt: finalTry(job, QUEUES.lessonDraft),
      });
    }
  }),
);
await boss.work(
  QUEUES.calibration,
  { batchSize: 1 },
  reported(QUEUES.calibration, async (jobs: Job<JobPayloads["calibration.run"]>[]) => {
    for (const job of jobs) {
      await runCalibration(db, job.data.tenantId, job.data.runId, {
        llm,
        model: reviewModel,
        finalAttempt: finalTry(job, QUEUES.calibration),
      });
    }
  }),
);
if (!whisperConfig()) log.warn("WHISPER_BASE_URL is not set: recordings are not transcribed");

log.info("worker ready", { queues: Object.keys(QUEUE_OPTIONS) });

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info("worker draining", { signal });
  await boss.stop({ graceful: true, timeout: 30_000 });
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
