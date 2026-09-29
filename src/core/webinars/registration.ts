/**
 * What a registration records about consent (webinar brief §5, consent per
 * purpose): taking part is the registration itself, with the recording
 * notice when the session is recorded; the academy's news and being
 * contacted are separate, optional and unticked. Each is stored with the
 * exact wording shown and when.
 */
export const CONSENT_PURPOSES = ["participation", "marketing", "lead_handoff"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export interface GivenConsent {
  purpose: ConsentPurpose;
  wording: string;
  /** ISO time the person agreed. */
  at: string;
}

export function givenConsents(
  shown: {
    participation: string;
    /** Shown with the participation wording when the session is recorded. */
    recording?: string | null;
    marketing?: string | null;
    leadHandoff?: string | null;
  },
  now: Date,
): GivenConsent[] {
  const at = now.toISOString();
  const consents: GivenConsent[] = [
    {
      purpose: "participation",
      wording: shown.recording ? `${shown.participation} ${shown.recording}` : shown.participation,
      at,
    },
  ];
  if (shown.marketing) consents.push({ purpose: "marketing", wording: shown.marketing, at });
  if (shown.leadHandoff) consents.push({ purpose: "lead_handoff", wording: shown.leadHandoff, at });
  return consents;
}

export type RegistrationStatus = "pending" | "registered" | "waitlist" | "cancelled";

/** Registrations that count as confirmed: a seat or a place on the waitlist. */
export function isConfirmed(status: RegistrationStatus): boolean {
  return status === "registered" || status === "waitlist";
}

/**
 * The webinar funnel (webinar brief §3): page views, registrations sent,
 * confirmed addresses, attendance, then the linked course (started, handed
 * in, passed) among those who came through the webinar.
 */
export const WEBINAR_FUNNEL_STEPS = [
  "views",
  "registrations",
  "confirmed",
  "attended",
  "course_started",
  "course_submitted",
  "course_passed",
] as const;
export type WebinarFunnelStep = (typeof WEBINAR_FUNNEL_STEPS)[number];
