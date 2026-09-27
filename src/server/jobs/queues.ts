import type { Queue } from "pg-boss";

/**
 * Background jobs (brief §11): pg-boss keeps the queue in Postgres, the worker
 * container (src/worker) runs the handlers. Every job carries its tenant id
 * and must be idempotent: pg-boss retries failed jobs.
 */
export const QUEUES = {
  notifications: "notifications.dispatch",
  review: "review.run",
  transcription: "transcription.run",
  keyframes: "keyframes.extract",
  lessonDraft: "lessons.draft",
  imageRender: "image.render",
  filesCleanup: "files.cleanup",
  sourcesExtract: "sources.extract",
  calibration: "calibration.run",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface JobPayloads {
  /** Every minute, for every academy: learner mail that is due (see server/notifications.ts). */
  "notifications.dispatch": Record<string, never>;
  "review.run": { tenantId: string; submissionId: string };
  "transcription.run": { tenantId: string; sourceId: string };
  "keyframes.extract": { tenantId: string; sourceId: string };
  "lessons.draft": { tenantId: string; draftId: string };
  "image.render": { tenantId: string; credentialId: string };
  /** Daily, for every academy: uploads nobody claimed. */
  "files.cleanup": Record<string, never>;
  /** Documents, web pages and interviews: text → chunks (→ embeddings). */
  "sources.extract": { tenantId: string; sourceId: string };
  "calibration.run": { tenantId: string; runId: string };
}

export const QUEUE_OPTIONS: Record<QueueName, Omit<Queue, "name">> = {
  // Retries live on each notification; a missed run is simply the next minute's.
  "notifications.dispatch": { retryLimit: 0, expireInSeconds: 5 * 60 },
  "review.run": { retryLimit: 3, retryDelay: 20, retryBackoff: true, expireInSeconds: 300 },
  "transcription.run": { retryLimit: 2, retryDelay: 60, expireInSeconds: 60 * 60 },
  "keyframes.extract": { retryLimit: 2, retryDelay: 60, expireInSeconds: 30 * 60 },
  "lessons.draft": { retryLimit: 2, retryDelay: 60, expireInSeconds: 15 * 60 },
  "image.render": { retryLimit: 3, retryDelay: 10, expireInSeconds: 120 },
  "files.cleanup": { retryLimit: 1, retryDelay: 600, expireInSeconds: 30 * 60 },
  "sources.extract": { retryLimit: 2, retryDelay: 30, expireInSeconds: 10 * 60 },
  "calibration.run": { retryLimit: 1, retryDelay: 60, expireInSeconds: 30 * 60 },
};
