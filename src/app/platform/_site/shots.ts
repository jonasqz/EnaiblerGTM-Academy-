import type { StaticImageData } from "next/image";

import feedbackDe from "@/app/platform/_site/images/feedback-de.webp";
import feedbackEn from "@/app/platform/_site/images/feedback-en.webp";
import landingDesktopDe from "@/app/platform/_site/images/landing-desktop-de.webp";
import landingDesktopEn from "@/app/platform/_site/images/landing-desktop-en.webp";
import landingPhoneDe from "@/app/platform/_site/images/landing-phone-de.webp";
import landingPhoneEn from "@/app/platform/_site/images/landing-phone-en.webp";
import lessonPhoneDe from "@/app/platform/_site/images/lesson-phone-de.webp";
import lessonPhoneEn from "@/app/platform/_site/images/lesson-phone-en.webp";
import shareImageDe from "@/app/platform/_site/images/share-image-de.webp";
import shareImageEn from "@/app/platform/_site/images/share-image-en.webp";
import shareKitDe from "@/app/platform/_site/images/share-kit-de.webp";
import shareKitEn from "@/app/platform/_site/images/share-kit-en.webp";
import studioLeadsDe from "@/app/platform/_site/images/studio-leads-de.webp";
import studioLeadsEn from "@/app/platform/_site/images/studio-leads-en.webp";
import studioOutcomeDe from "@/app/platform/_site/images/studio-outcome-de.webp";
import studioOutcomeEn from "@/app/platform/_site/images/studio-outcome-en.webp";
import studioOverviewDe from "@/app/platform/_site/images/studio-overview-de.webp";
import studioOverviewEn from "@/app/platform/_site/images/studio-overview-en.webp";
import type { Locale } from "@/core/i18n/locales";

/*
 * Screens of the product for the website, taken from a demo academy with
 * sample data (a fictional brand, never a customer's), in both languages.
 * Static imports: hashed under /_next/static, which every host serves.
 */
export const SHOTS = {
  feedback: { en: feedbackEn, de: feedbackDe },
  landingDesktop: { en: landingDesktopEn, de: landingDesktopDe },
  landingPhone: { en: landingPhoneEn, de: landingPhoneDe },
  lessonPhone: { en: lessonPhoneEn, de: lessonPhoneDe },
  shareImage: { en: shareImageEn, de: shareImageDe },
  shareKit: { en: shareKitEn, de: shareKitDe },
  studioLeads: { en: studioLeadsEn, de: studioLeadsDe },
  studioOutcome: { en: studioOutcomeEn, de: studioOutcomeDe },
  studioOverview: { en: studioOverviewEn, de: studioOverviewDe },
} satisfies Record<string, Record<Locale, StaticImageData>>;

export type ShotName = keyof typeof SHOTS;

export function shot(name: ShotName, locale: Locale): StaticImageData {
  return SHOTS[name][locale];
}
