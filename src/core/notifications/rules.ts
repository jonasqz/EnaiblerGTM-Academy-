/**
 * When learner mail goes out (brief §9: review ready, level-up). Review mails
 * wait a little: an AI review usually lands while the learner is still on the
 * page, and a result they watched arrive needs no mail.
 */
export const REVIEW_MAIL_DELAY_SECONDS = 120;

/** Failed sends are retried this often before the notification counts as failed. */
export const MAX_SEND_ATTEMPTS = 5;

const DECIDED = new Set(["passed", "needs_revision", "overridden"]);

export type ReviewMailDecision = "send" | "seen" | "undecided";

export function reviewMailDecision(submission: {
  status: string;
  decidedAt: Date | null;
  resultSeenAt: Date | null;
}): ReviewMailDecision {
  if (!DECIDED.has(submission.status) || !submission.decidedAt) return "undecided";
  if (submission.resultSeenAt && submission.resultSeenAt >= submission.decidedAt) return "seen";
  return "send";
}

/** Backoff after a failed send (the relay is down, a timeout): 1, 5, 15, 60 minutes. */
export function retryDelaySeconds(attempts: number): number {
  const minutes = [1, 5, 15, 60][Math.min(Math.max(attempts, 1), 4) - 1]!;
  return minutes * 60;
}
