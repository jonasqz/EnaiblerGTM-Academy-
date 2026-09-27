import type { CompletionMode } from "@/core/courses/completion";
import type { ShareChannel } from "@/core/credentials/share";
import type { LocalizedText } from "@/core/i18n/locales";

/*
 * Leads (brief §9, lead handoff): learners who agreed that the academy may
 * contact them, with what they completed and where they came from, so a
 * follow-up has context. A shared certificate that brought someone in is
 * named by its course only, never by the learner who shared it.
 */

export interface LeadCourse {
  courseId: string;
  /** As on the certificate. */
  title: LocalizedText;
  completedAt: Date;
  /** How it was earned: the work, the final test or both. */
  basis: CompletionMode;
  visibility: "public" | "private";
  /** Where the learner shared the certificate on LinkedIn. */
  sharedOn: ShareChannel[];
}

export interface LeadSource {
  /** utm values of the entry link of the first course they started. */
  utm: { source?: string; medium?: string; campaign?: string };
  /**
   * That link came from the call to action of someone's shared certificate:
   * the certificate's course, or null when the certificate is gone.
   */
  viaCertificate: { courseTitle: LocalizedText | null } | null;
}

export interface Lead {
  userId: string;
  alias: string;
  name: string | null;
  email: string;
  locale: string | null;
  /** The exact wording they agreed to. */
  wording: string;
  requestedAt: Date;
  agreedAt: Date;
  completed: LeadCourse[];
  /** Courses started and not completed yet. */
  inProgress: Array<{ courseId: string; title: LocalizedText }>;
  /** Null until they start a course. */
  source: LeadSource | null;
}

/** The columns every contact list starts with, for the academy's own tools. */
export const CONTACT_COLUMNS = [
  "email",
  "name",
  "language",
  "agreed_to",
  "asked_at",
  "confirmed_at",
] as const;

/** Leads carry what a CRM needs for a first message: what they did and where they came from. */
export const LEAD_COLUMNS = [
  ...CONTACT_COLUMNS,
  "courses_completed",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "via_shared_certificate",
  "certificate_course",
] as const;

const day = (date: Date) => date.toISOString().slice(0, 10);

/** "Get paid on time (2026-09-12, work, public, linkedin_post)", codes a CRM can filter on. */
function courseCell(course: LeadCourse, title: (text: LocalizedText) => string): string {
  const facts = [
    day(course.completedAt),
    course.basis,
    course.visibility,
    ...course.sharedOn.map((channel) => `linkedin_${channel}`),
  ];
  return `${title(course.title)} (${facts.join(", ")})`;
}

/** One lead as a row under LEAD_COLUMNS; course titles in the language `title` picks. */
export function leadCsvRow(
  lead: Lead,
  title: (text: LocalizedText) => string,
): Array<string | boolean | null> {
  const via = lead.source?.viaCertificate ?? null;
  return [
    lead.email,
    lead.name,
    lead.locale,
    lead.wording,
    lead.requestedAt.toISOString(),
    lead.agreedAt.toISOString(),
    lead.completed.map((course) => courseCell(course, title)).join(" | "),
    lead.source?.utm.source ?? null,
    lead.source?.utm.medium ?? null,
    lead.source?.utm.campaign ?? null,
    via !== null,
    via?.courseTitle ? title(via.courseTitle) : null,
  ];
}
