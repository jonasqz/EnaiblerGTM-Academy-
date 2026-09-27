import { can, reviewsLimitedToCohorts, type MembershipRole } from "@/core/access/roles";

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

/*
 * Review alerts: team members hear about hand-ins that wait for a person
 * (brief §8: held results and spot checks), at most once an hour each, in
 * one mail for everything that came in meanwhile. The first one waits a few
 * minutes too, so hand-ins arriving together share a mail and one decided on
 * the spot needs none.
 */
export const REVIEW_ALERT_DELAY_SECONDS = 5 * 60;
export const REVIEW_ALERT_INTERVAL_SECONDS = 60 * 60;

/** When a new alert to someone may go out, given when their last one did. */
export function reviewAlertSendAfter(now: Date, lastSentAt: Date | null): Date {
  const soonest = now.getTime() + REVIEW_ALERT_DELAY_SECONDS * 1000;
  const spaced = lastSentAt ? lastSentAt.getTime() + REVIEW_ALERT_INTERVAL_SECONDS * 1000 : 0;
  return new Date(Math.max(soonest, spaced));
}

/** Until when a due alert has to wait, because the last one went out less than an hour ago. */
export function reviewAlertWaitsUntil(now: Date, lastSentAt: Date | null): Date | null {
  if (!lastSentAt) return null;
  const next = lastSentAt.getTime() + REVIEW_ALERT_INTERVAL_SECONDS * 1000;
  return next > now.getTime() ? new Date(next) : null;
}

/**
 * Whose waiting hand-ins a team member hears about: everyone's, only their
 * cohorts' (mentors, as in the review queue), or nobody's.
 */
export function reviewAlertScope(roles: readonly MembershipRole[]): "all" | "cohorts" | null {
  if (!can(roles, "reviews.decide")) return null;
  return reviewsLimitedToCohorts(roles) ? "cohorts" : "all";
}
