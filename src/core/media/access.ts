/**
 * Who may watch a video (webinar brief §2.4, access control). Private by
 * default: a new video is for the academy's signed-in learners. Public ones
 * play for anyone on the academy's domain. A webinar's recording is for those
 * who registered for it (core/webinars/relive) unless its host allowed more.
 */
export const MEDIA_ACCESS = ["public", "learners", "registrants"] as const;
export type MediaAccess = (typeof MEDIA_ACCESS)[number];

export function isMediaAccess(value: unknown): value is MediaAccess {
  return typeof value === "string" && (MEDIA_ACCESS as readonly string[]).includes(value);
}

export interface MediaViewer {
  /** Signed in to this academy with a membership (learners and the team). */
  member: boolean;
  /** Authors preview every video of the academy. */
  canEditCourses: boolean;
  /** Signed up for where the video is shown: a webinar showing it as its re-live. */
  signedUp?: boolean;
}

export function canWatch(access: MediaAccess, viewer: MediaViewer | null): boolean {
  if (viewer?.canEditCourses) return true;
  switch (access) {
    case "public":
      return true;
    case "learners":
      return viewer?.member ?? false;
    case "registrants":
      return Boolean(viewer?.member && viewer.signedUp);
  }
}

/** Only signed-in viewers are tracked; anonymous viewers of public videos leave nothing behind. */
export function tracksViewer(viewer: MediaViewer | null): boolean {
  return viewer?.member ?? false;
}

/** Why a video cannot be made or processed; the Studio words the code. */
export const MEDIA_ERRORS = ["no_video", "transcode_failed", "source_missing"] as const;
export type MediaError = (typeof MEDIA_ERRORS)[number];

export function isMediaError(value: unknown): value is MediaError {
  return typeof value === "string" && (MEDIA_ERRORS as readonly string[]).includes(value);
}
