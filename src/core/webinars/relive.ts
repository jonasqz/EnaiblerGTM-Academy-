/**
 * Who may watch a webinar's recording (webinar brief §2.4, §5). Private by
 * default: registrants only. Showing it to every learner or to the public
 * needs the host to confirm that attendees' faces, voices and names are out
 * of the recording or that they agreed.
 */
export const RELIVE_ACCESS = ["registrants", "learners", "public"] as const;
export type ReliveAccess = (typeof RELIVE_ACCESS)[number];

export function isReliveAccess(value: unknown): value is ReliveAccess {
  return typeof value === "string" && (RELIVE_ACCESS as readonly string[]).includes(value);
}
