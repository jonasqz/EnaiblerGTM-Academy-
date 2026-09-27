import { sql } from "drizzle-orm";
import { fromDrizzle, PgBoss } from "pg-boss";

import type { Transaction } from "@/db/client";
import { QUEUE_OPTIONS, type JobPayloads, type QueueName } from "@/server/jobs/queues";

/**
 * Sending jobs from the web app. Jobs are written inside the caller's
 * transaction (fromDrizzle), so a rolled-back submission never leaves a
 * stray review job behind. Maintenance and scheduling stay with the worker.
 */
let producer: Promise<PgBoss> | null = null;

function getProducer(): Promise<PgBoss> {
  producer ??= (async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    const boss = new PgBoss({
      connectionString,
      schema: "pgboss",
      createSchema: false,
      supervise: false,
      schedule: false,
      max: 2,
    });
    boss.on("error", (error) => console.error("[jobs] pg-boss error", error));
    await boss.start();
    for (const [name, options] of Object.entries(QUEUE_OPTIONS))
      await boss.createQueue(name, options);
    return boss;
  })().catch((error: unknown) => {
    producer = null;
    throw error;
  });
  return producer;
}

export type Enqueue = <Q extends QueueName>(
  tx: Transaction,
  name: Q,
  data: JobPayloads[Q],
  options?: { id?: string },
) => Promise<void>;

/** Enqueue within a transaction. Pass `id` (a uuid) to make the job idempotent. */
export const enqueue: Enqueue = async (tx, name, data, options) => {
  const boss = await getProducer();
  await boss.send(name, data, { ...options, db: fromDrizzle(tx, sql) });
};
