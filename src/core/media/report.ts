import { z } from "zod";

import type { ProgressReport } from "@/core/media/ranges";

/*
 * The player's progress report as the server reads it. Apart from ranges.ts,
 * which the player itself uses, so the browser does not load Zod for it.
 */

/** Longest video we measure (a long webinar recording); anything reported beyond is noise. */
export const MAX_DURATION_SEC = 12 * 60 * 60;
/** Enough for a viewer who skips around a lot; merged lists are far shorter. */
export const MAX_REPORTED_RANGES = 500;

const seconds = z.number().finite().min(0).max(MAX_DURATION_SEC);

export const progressReportSchema = z.strictObject({
  asset: z.uuid(),
  ranges: z.array(z.tuple([seconds, seconds])).max(MAX_REPORTED_RANGES),
  position: seconds.optional(),
  duration: z.number().finite().positive().max(MAX_DURATION_SEC).optional(),
}) satisfies z.ZodType<ProgressReport>;
