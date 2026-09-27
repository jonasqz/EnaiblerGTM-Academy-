import { isLocale, type Locale } from "@/core/i18n/locales";

/**
 * Marketing consent (brief §9): only with double opt-in. Asking stores the
 * exact wording and sends a confirmation link; only the click confirms it.
 * The tenant decides where marketing mail is sent from, so confirmed
 * contacts leave the academy by export, never as mail from here.
 */
export const CONFIRM_LINK_TTL_DAYS = 7;

/**
 * The news box on the sign-in form. Ticked, it rides along in the magic
 * link's continue URL (no cookie) as the language the learner read its
 * wording in, so the double opt-in that starts after sign-in stores and
 * mails exactly that wording.
 */
export const NEWS_PARAM = "news";

export function newsOptInLocale(
  value: string | null | undefined,
  offered: readonly Locale[],
): Locale | null {
  return isLocale(value) && offered.includes(value) ? value : null;
}

export type ConsentState = "none" | "pending" | "expired" | "confirmed" | "revoked";

export interface ConsentRecord {
  requestedAt: Date;
  confirmTokenHash: string | null;
  confirmedAt: Date | null;
  revokedAt: Date | null;
}

export function consentState(record: ConsentRecord | null | undefined, now: Date): ConsentState {
  if (!record) return "none";
  if (record.revokedAt) return "revoked";
  if (record.confirmedAt) return "confirmed";
  if (!record.confirmTokenHash) return "expired";
  const expires = record.requestedAt.getTime() + CONFIRM_LINK_TTL_DAYS * 24 * 60 * 60_000;
  return now.getTime() < expires ? "pending" : "expired";
}

/** Whether a confirmation link for this record may still confirm it. */
export function canConfirm(record: ConsentRecord | null | undefined, now: Date): boolean {
  return consentState(record, now) === "pending";
}
