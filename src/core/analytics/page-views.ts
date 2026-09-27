import { z } from "zod";

/**
 * Page views (brief §10/§11): cookieless, self-hosted Umami or Plausible CE,
 * next to our own product events. Tracked by hand, so only a cleaned path is
 * sent: never a query string, never pages whose URL carries a token, never
 * the Studio or the path picker inside other sites.
 */
export const pageAnalyticsSchema = z.discriminatedUnion("provider", [
  z.strictObject({
    provider: z.literal("umami"),
    scriptUrl: z.url({ protocol: /^https?$/ }),
    websiteId: z.string().trim().min(1).max(100),
  }),
  z.strictObject({
    provider: z.literal("plausible"),
    scriptUrl: z.url({ protocol: /^https?$/ }),
  }),
]);

export type PageAnalyticsConfig = z.infer<typeof pageAnalyticsSchema>;

/** From ANALYTICS_PROVIDER, ANALYTICS_SCRIPT_URL and (Umami) ANALYTICS_WEBSITE_ID; null when off. */
export function pageAnalyticsConfig(input: {
  provider?: string;
  scriptUrl?: string;
  websiteId?: string;
}): PageAnalyticsConfig | null {
  if (!input.provider?.trim()) return null;
  const parsed = pageAnalyticsSchema.safeParse({
    provider: input.provider.trim().toLowerCase(),
    scriptUrl: input.scriptUrl?.trim(),
    ...(input.provider.trim().toLowerCase() === "umami" ? { websiteId: input.websiteId } : {}),
  });
  return parsed.success ? parsed.data : null;
}

const UNTRACKED = [
  /^\/sign-in\/confirm/,
  /^\/consent\/confirm/,
  /^\/auth\//,
  /^\/join\//,
  /^\/studio(\/|$)/,
  /^\/embed(\/|$)/,
  /^\/api\//,
];

/** The path to report for this page, or null when this page is not tracked. */
export function pageViewPath(pathname: string | null | undefined): string | null {
  if (!pathname || !pathname.startsWith("/")) return null;
  const path = pathname.split(/[?#]/)[0]!;
  return UNTRACKED.some((pattern) => pattern.test(path)) ? null : path;
}
