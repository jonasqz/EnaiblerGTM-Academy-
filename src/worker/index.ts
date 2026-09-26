/**
 * Worker container: `npm run worker` (dev) / `node --import tsx src/worker/index.ts`.
 * Same repo and image as the web app, different command (brief §11).
 */
import { PgBoss, type Job } from "pg-boss";

import { createDatabase, assertRlsEnforced } from "@/db/client";
import { sendEmail } from "@/server/email/mailer";
import { QUEUE_OPTIONS, QUEUES, type JobPayloads, type QueueName } from "@/server/jobs/queues";

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

await boss.work(QUEUES.email, { batchSize: 5 }, async (jobs: Job<JobPayloads["email.send"]>[]) => {
  for (const job of jobs) await sendEmail(job.data.email);
});

// Handlers for review, transcription, keyframes, lesson drafting and image
// rendering land with their features; their jobs wait in the queue until then.
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
