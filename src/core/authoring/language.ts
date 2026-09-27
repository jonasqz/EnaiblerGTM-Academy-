import type { Locale } from "@/core/i18n/locales";

/** Language names for prompts (the model writes in these). */
export const LANGUAGE_LABELS: Record<Locale, string> = { de: "German", en: "English" };

/** How the model should write for learners in each language. */
export const WRITING_GUIDANCE: Record<Locale, string> = {
  de: 'German, addressing the learner with the informal "du"',
  en: "English, addressing the learner as you",
};
