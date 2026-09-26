import { encodeEntryContext, isEmptyEntryContext, type EntryContext } from "@/core/entry/context";

/**
 * Entry context travels in URLs, not cookies: /start → course page → sign-in
 * → magic link → /auth/continue. Nothing is stored in the browser.
 */
export function withContext(path: string, context: EntryContext): string {
  if (isEmptyEntryContext(context)) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}ctx=${encodeEntryContext(context)}`;
}

export function continueUrl(context: EntryContext): string {
  return withContext("/auth/continue", context);
}
