import { NEWS_PARAM } from "@/core/consent/marketing";
import { encodeEntryContext, isEmptyEntryContext, type EntryContext } from "@/core/entry/context";
import type { Locale } from "@/core/i18n/locales";

/**
 * Entry context travels in URLs, not cookies: /start → course page → sign-in
 * → magic link → /auth/continue. Nothing is stored in the browser.
 */
export function withContext(path: string, context: EntryContext): string {
  if (isEmptyEntryContext(context)) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}ctx=${encodeEntryContext(context)}`;
}

/**
 * Where the magic link lands. `news` is the language of the news box the
 * learner ticked on the sign-in form (core/consent/marketing).
 */
export function continueUrl(
  context: EntryContext,
  next?: string | null,
  news?: Locale | null,
): string {
  let url = withContext("/auth/continue", context);
  const append = (key: string, value: string) => {
    url = `${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
  };
  if (next) append("next", next);
  if (news) append(NEWS_PARAM, news);
  return url;
}
