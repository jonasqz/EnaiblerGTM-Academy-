import { pageAnalyticsConfig, type PageAnalyticsConfig } from "@/core/analytics/page-views";

/** The operator's page-view analytics (ANALYTICS_*), or null when none is set up. */
export function pageAnalytics(): PageAnalyticsConfig | null {
  return pageAnalyticsConfig({
    provider: process.env.ANALYTICS_PROVIDER,
    scriptUrl: process.env.ANALYTICS_SCRIPT_URL,
    websiteId: process.env.ANALYTICS_WEBSITE_ID,
  });
}
