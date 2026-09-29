import type { WordingFinding } from "@/core/compliance/wording-lint";
import { isLocale, type Locale } from "@/core/i18n/locales";
import { SLUG_PATTERN } from "@/core/shared/slug";
import { lintWebinarContent, type WebinarContent } from "@/core/webinars/landing";
import { webinarEnd } from "@/core/webinars/phase";
import { joinUrlIssue } from "@/core/webinars/tools";
import { isTimeZone, zonedTimeToUtc } from "@/core/webinars/time";

/**
 * A webinar's setup as the Studio enters it (webinar brief §2.2): title and
 * description in the webinar's language, a local date and time in its zone,
 * how long it runs, how many seats, the tool's link and the course it leads
 * into. Problems are reported by code; the Studio words them.
 */

export const DURATION_MINUTES = { min: 10, max: 600 } as const;
export const CAPACITY_MAX = 100_000;
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 4000;
export const RECORDING_NOTICE_MAX = 600;

export interface WebinarSetupInput {
  slug: string;
  locale: string;
  title: string;
  description: string;
  date: string;
  time: string;
  timeZone: string;
  durationMinutes: string;
  /** Empty: no limit. */
  capacity: string;
  joinUrl: string;
  /** Empty: stands alone. */
  courseId: string;
  recorded: boolean;
  recordingNotice: string;
}

export interface WebinarSetup {
  slug: string;
  locale: Locale;
  title: string;
  description: string;
  startsAt: Date;
  timeZone: string;
  durationMinutes: number;
  capacity: number | null;
  joinUrl: string | null;
  courseId: string | null;
  recorded: boolean;
  recordingNotice: string | null;
}

export type SetupIssue =
  | "slug"
  | "locale"
  | "title"
  | "description_long"
  | "date"
  | "time_zone"
  | "duration"
  | "capacity"
  | "join_url"
  | "join_url_https"
  | "course"
  | "recording_notice_long";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateSetup(
  input: WebinarSetupInput,
  options: { locales: readonly Locale[] },
): { ok: true; setup: WebinarSetup } | { ok: false; issues: SetupIssue[] } {
  const issues: SetupIssue[] = [];
  const slug = input.slug.trim().toLowerCase();
  if (slug.length < 2 || slug.length > 64 || !SLUG_PATTERN.test(slug)) issues.push("slug");
  const locale = input.locale.trim();
  if (!isLocale(locale) || !options.locales.includes(locale)) issues.push("locale");
  const title = input.title.trim();
  if (title.length < 3 || title.length > TITLE_MAX) issues.push("title");
  const description = input.description.replace(/\r\n?/g, "\n").trim();
  if (description.length > DESCRIPTION_MAX) issues.push("description_long");
  const timeZone = input.timeZone.trim();
  if (!isTimeZone(timeZone)) issues.push("time_zone");
  const startsAt = isTimeZone(timeZone)
    ? zonedTimeToUtc(input.date.trim(), input.time.trim(), timeZone)
    : null;
  if (!startsAt) issues.push("date");
  const duration = Number(input.durationMinutes);
  if (
    !Number.isInteger(duration) ||
    duration < DURATION_MINUTES.min ||
    duration > DURATION_MINUTES.max
  )
    issues.push("duration");
  const capacityText = input.capacity.trim();
  const capacity = capacityText === "" ? null : Number(capacityText);
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > CAPACITY_MAX))
    issues.push("capacity");
  const joinUrl = input.joinUrl.trim();
  const urlIssue = joinUrl ? joinUrlIssue(joinUrl) : null;
  if (urlIssue === "invalid") issues.push("join_url");
  if (urlIssue === "https") issues.push("join_url_https");
  const courseId = input.courseId.trim();
  if (courseId && !UUID.test(courseId)) issues.push("course");
  const notice = input.recordingNotice.replace(/\r\n?/g, "\n").trim();
  if (notice.length > RECORDING_NOTICE_MAX) issues.push("recording_notice_long");

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    setup: {
      slug,
      locale: locale as Locale,
      title,
      description,
      startsAt: startsAt!,
      timeZone,
      durationMinutes: duration,
      capacity,
      joinUrl: joinUrl || null,
      courseId: courseId || null,
      recorded: input.recorded,
      recordingNotice: input.recorded && notice ? notice : null,
    },
  };
}

export type PublishIssueCode =
  | "description_missing"
  | "ended"
  | "legal_pages_missing"
  | "wording"
  | "join_url_missing"
  | "course_not_published";

export interface WebinarPublishIssue {
  code: PublishIssueCode;
  severity: "error" | "warning";
  finding?: WordingFinding;
}

/**
 * What stands between a webinar and its landing page going live. Errors
 * block; warnings are for the host (a join link may come later, but before
 * the reminders say "starting now").
 */
export function webinarPublishIssues(input: {
  content: WebinarContent;
  startsAt: Date;
  durationMinutes: number;
  joinUrl: string | null;
  /** The academy's imprint and privacy page: the form collects personal data. */
  legal: { imprint?: string; privacy?: string };
  course: { status: string } | null;
  now: Date;
}): WebinarPublishIssue[] {
  const issues: WebinarPublishIssue[] = [];
  if (!input.content.description.trim())
    issues.push({ code: "description_missing", severity: "error" });
  if (webinarEnd(input).getTime() <= input.now.getTime())
    issues.push({ code: "ended", severity: "error" });
  if (!input.legal.imprint || !input.legal.privacy)
    issues.push({ code: "legal_pages_missing", severity: "error" });
  for (const finding of lintWebinarContent(input.content)) {
    issues.push({ code: "wording", severity: finding.severity, finding });
  }
  if (!input.joinUrl) issues.push({ code: "join_url_missing", severity: "warning" });
  if (input.course && input.course.status !== "published")
    issues.push({ code: "course_not_published", severity: "warning" });
  return issues;
}

export function blocksPublishing(issues: readonly WebinarPublishIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
