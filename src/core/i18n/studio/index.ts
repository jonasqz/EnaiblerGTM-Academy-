import type { Locale } from "@/core/i18n/locales";
import * as authoring from "@/core/i18n/studio/authoring";
import * as brand from "@/core/i18n/studio/brand";
import * as common from "@/core/i18n/studio/common";
import * as courses from "@/core/i18n/studio/courses";
import * as drafts from "@/core/i18n/studio/drafts";
import * as lessons from "@/core/i18n/studio/lessons";
import * as media from "@/core/i18n/studio/media";
import * as series from "@/core/i18n/studio/series";
import * as settings from "@/core/i18n/studio/settings";
import * as team from "@/core/i18n/studio/team";
import * as webinars from "@/core/i18n/studio/webinars";

/**
 * The Studio's words, in English and German (brief §12: DE/EN). One file per
 * area so each stays readable; TypeScript makes every area list both
 * languages. German copy uses "du", like the learner side. Not overridable
 * per academy: this is enaibler's tool talking to the academy's team.
 *   {name}          variable passed to t()
 *   key.one/.other  plural forms, chosen by t.n(key, count)
 */
export const STUDIO_AREAS = {
  common,
  courses,
  authoring,
  drafts,
  lessons,
  team,
  settings,
  brand,
  media,
  webinars,
  series,
} as const;

const en = {
  ...common.en,
  ...courses.en,
  ...authoring.en,
  ...drafts.en,
  ...lessons.en,
  ...team.en,
  ...settings.en,
  ...brand.en,
  ...media.en,
  ...webinars.en,
  ...series.en,
};

export type StudioKey = keyof typeof en;

const de: Record<StudioKey, string> = {
  ...common.de,
  ...courses.de,
  ...authoring.de,
  ...drafts.de,
  ...lessons.de,
  ...team.de,
  ...settings.de,
  ...brand.de,
  ...media.de,
  ...webinars.de,
  ...series.de,
};

export const STUDIO_MESSAGES: Record<Locale, Record<StudioKey, string>> = { en, de };
