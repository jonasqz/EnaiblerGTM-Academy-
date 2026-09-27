/**
 * Why a background job gave up on a source, a lesson draft or a calibration
 * run. The row stores the code and the Studio words it in the team member's
 * language. Rows from before the codes hold an English sentence, which is
 * shown as it is.
 */
export const JOB_ERRORS = [
  "gateway_missing",
  "gateway_failed",
  "invalid_review",
  "invalid_drafts",
  "no_assignment",
  "whisper_missing",
  "file_missing",
  "no_speech",
  "transcription_failed",
  "address_blocked",
  "not_a_page",
  "page_unreachable",
  "no_text_scan",
  "no_text",
  "read_failed",
] as const;

export type JobError = (typeof JOB_ERRORS)[number];

export function isJobError(value: string | null | undefined): value is JobError {
  return (JOB_ERRORS as readonly string[]).includes(value ?? "");
}

/** Failures that trying again will not fix: the job stops at once. */
export const PERMANENT_JOB_ERRORS: ReadonlySet<JobError> = new Set([
  "file_missing",
  "address_blocked",
  "not_a_page",
  "no_text_scan",
  "no_text",
]);

/** Thrown inside a job to give up with a code. */
export class JobFailure extends Error {
  constructor(readonly code: JobError) {
    super(code);
    this.name = "JobFailure";
  }
}

export function jobErrorCode(error: unknown, fallback: JobError): JobError {
  return error instanceof JobFailure ? error.code : fallback;
}
