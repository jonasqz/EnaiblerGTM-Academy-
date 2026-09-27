/**
 * Worker container: `npm run worker` (dev) / `node --import tsx src/worker/index.ts`.
 * Same repo and image as the web app, different command (brief §11).
 */
import { eq } from "drizzle-orm";
import { PgBoss, type Job } from "pg-boss";

import { createDatabase, assertRlsEnforced } from "@/db/client";
import { tenants } from "@/db/schema";
import { findTenantById } from "@/db/tenants";
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
import { runCalibration } from "@/server/review/calibration";
import { processSubmission } from "@/server/review/process-submission";
import { storageConfigured } from "@/server/storage";
import { dispatchWebhooks, purgeOldDeliveries } from "@/server/webhooks";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[worker] DATABASE_URL is not set");
  process.exit(1);
}

const { db, pool } = createDatabase(connectionString, { max: 4 });
await assertRlsEnforced(db);

// The pgboss schema is created by deploy/postgres/init.sh (owned by the app role),
// so pg-boss only migrates its tables and never needs CREATE on the database.
const boss = new PgBoss({ connectionString, schema: "pgboss", createSchema: false });
boss.on("error", (error) => console.error("[worker] pg-boss error", error));
await boss.start();

// Queues must exist before anyone can send to them; createQueue is idempotent.
for (const [name, options] of Object.entries(QUEUE_OPTIONS) as Array<
  [QueueName, (typeof QUEUE_OPTIONS)[QueueName]]
>) {
  await boss.createQueue(name, options);
}

const activeTenants = () =>
  db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.status, "active"));

// Learner mail (review ready, level-up), every minute for every active academy.
await boss.work(QUEUES.notifications, async () => {
  for (const { id } of await activeTenants()) {
    const tenant = await findTenantById(db, id);
    if (!tenant) continue;
    const result = await dispatchNotifications(db, tenant, { send: sendEmail });
    if (result.sent + result.failed > 0) {
      console.log(`[worker] mail for ${tenant.slug}: ${result.sent} sent, ${result.failed} failed`);
    }
  }
});
await boss.schedule(QUEUES.notifications, "* * * * *");

// Webhooks (brief §10): queued with the event, sent here with retries.
await boss.work(QUEUES.webhooks, async () => {
  for (const tenant of await activeTenants()) {
    const result = await dispatchWebhooks(db, tenant.id);
    if (result.delivered + result.failed > 0) {
      console.log(
        `[worker] webhooks for ${tenant.slug}: ${result.delivered} delivered, ${result.failed} failed`,
      );
    }
  }
});
await boss.schedule(QUEUES.webhooks, "* * * * *");

// Retention: delivery logs hold learner data, sent mail only needs to be traceable for a while.
await boss.work(QUEUES.housekeeping, async () => {
  for (const tenant of await db.select({ id: tenants.id }).from(tenants)) {
    const deliveries = await purgeOldDeliveries(db, tenant.id);
    const mails = await purgeProcessedNotifications(db, tenant.id);
    if (deliveries + mails > 0) {
      console.log(`[worker] housekeeping ${tenant.id}: ${deliveries} deliveries, ${mails} mails`);
    }
  }
});
await boss.schedule(QUEUES.housekeeping, "41 3 * * *");

// Auto-update (brief §7): web pages lessons were written from, read again once a day.
await boss.work(QUEUES.sourcesRecheck, async () => {
  for (const tenant of await activeTenants()) {
    const result = await recheckDueSources(db, tenant.id);
    if (result.changed + result.failed > 0) {
      console.log(
        `[worker] sources of ${tenant.slug}: ${result.changed} changed, ${result.failed} unreadable`,
      );
    }
  }
});
await boss.schedule(QUEUES.sourcesRecheck, "23 4 * * *");

// Custom domains waiting for DNS: they go live without anyone pressing "check".
await boss.work(QUEUES.domainsCheck, async () => {
  const verified = await checkOpenClaims(db, systemDns);
  if (verified > 0) console.log(`[worker] ${verified} custom domain(s) verified`);
});
await boss.schedule(QUEUES.domainsCheck, "*/10 * * * *");

// Without a gateway every submission goes to the human queue ("ai_unavailable").
const llm = process.env.LLM_BASE_URL
  ? createLlmCaller({ baseUrl: process.env.LLM_BASE_URL, apiKey: process.env.LLM_API_KEY })
  : null;
const reviewModel = process.env.LLM_REVIEW_MODEL || "review-default";
const reviewRetries = QUEUE_OPTIONS[QUEUES.review].retryLimit ?? 0;
if (!llm) console.warn("[worker] LLM_BASE_URL is not set: submissions wait for a human review");

await boss.work(QUEUES.review, { batchSize: 1 }, async (jobs: Job<JobPayloads["review.run"]>[]) => {
  for (const job of jobs) {
    // On the last try a gateway failure holds the submission for a human
    // instead of failing the job, so no learner waits on a dead job.
    const outcome = await processSubmission(
      db,
      job.data,
      { llm, model: reviewModel },
      { finalAttempt: job.retryCount >= reviewRetries },
    );
    console.log(`[worker] review ${job.data.submissionId}: ${outcome.status}`);
  }
});

// Abandoned uploads (a hand-in form that was never sent), once a day per academy.
await boss.work(QUEUES.filesCleanup, async () => {
  if (!storageConfigured()) return;
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
  for (const tenant of await db.select({ id: tenants.id }).from(tenants)) {
    const removed = await cleanupPendingFiles(db, tenant.id, cutoff);
    if (removed > 0) console.log(`[worker] removed ${removed} unclaimed uploads of ${tenant.id}`);
  }
});
await boss.schedule(QUEUES.filesCleanup, "17 3 * * *");

// Authoring (brief §7): sources become text, recordings become topics with
// screenshots, and lessons are drafted backwards from the rubric.
const finalTry = (job: Job<unknown>, queue: QueueName) =>
  job.retryCount >= (QUEUE_OPTIONS[queue].retryLimit ?? 0);

await boss.work(
  QUEUES.sourcesExtract,
  { batchSize: 1 },
  async (jobs: Job<JobPayloads["sources.extract"]>[]) => {
    for (const job of jobs) {
      await extractSource(db, job.data.tenantId, job.data.sourceId, {
        finalAttempt: finalTry(job, QUEUES.sourcesExtract),
      });
    }
  },
);
await boss.work(
  QUEUES.transcription,
  { batchSize: 1 },
  async (jobs: Job<JobPayloads["transcription.run"]>[]) => {
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
  },
);
await boss.work(
  QUEUES.keyframes,
  { batchSize: 1 },
  async (jobs: Job<JobPayloads["keyframes.extract"]>[]) => {
    for (const job of jobs) await extractKeyframes(db, job.data.tenantId, job.data.sourceId);
  },
);
await boss.work(
  QUEUES.lessonDraft,
  { batchSize: 1 },
  async (jobs: Job<JobPayloads["lessons.draft"]>[]) => {
    for (const job of jobs) {
      await runLessonDraft(db, job.data.tenantId, job.data.draftId, {
        model: authoringModel(),
        embeddings: embeddingConfig(),
        finalAttempt: finalTry(job, QUEUES.lessonDraft),
      });
    }
  },
);
await boss.work(
  QUEUES.calibration,
  { batchSize: 1 },
  async (jobs: Job<JobPayloads["calibration.run"]>[]) => {
    for (const job of jobs) {
      await runCalibration(db, job.data.tenantId, job.data.runId, {
        llm,
        model: reviewModel,
        finalAttempt: finalTry(job, QUEUES.calibration),
      });
    }
  },
);
if (!whisperConfig())
  console.warn("[worker] WHISPER_BASE_URL is not set: recordings are not transcribed");

// Image rendering happens on request (next/og); its queue stays for pre-rendering later.
console.log(`[worker] ready: ${Object.keys(QUEUE_OPTIONS).join(", ")}`);

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[worker] ${signal}: draining`);
  await boss.stop({ graceful: true, timeout: 30_000 });
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
