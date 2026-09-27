/**
 * Submission states (brief §4): submitted → in_review → needs_revision /
 * passed / overridden. `overridden` means a human reversed a result that had
 * already been released; the human review then decides pass or fail.
 */
export const SUBMISSION_STATUSES = [
  "submitted",
  "in_review",
  "needs_revision",
  "passed",
  "overridden",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export type Outcome = "pending" | "passed" | "needs_revision";

export function effectiveOutcome(
  status: SubmissionStatus,
  latestHumanPass: boolean | null,
): Outcome {
  switch (status) {
    case "submitted":
    case "in_review":
      return "pending";
    case "passed":
      return "passed";
    case "needs_revision":
      return "needs_revision";
    case "overridden":
      return latestHumanPass === null ? "pending" : latestHumanPass ? "passed" : "needs_revision";
  }
}

/** A learner can hand in again only after a decision that asks for revision. */
export function canResubmit(outcome: Outcome | null): boolean {
  return outcome === null || outcome === "needs_revision";
}
