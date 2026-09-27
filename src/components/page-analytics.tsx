"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useState } from "react";

import { pageViewPath, type PageAnalyticsConfig } from "@/core/analytics/page-views";

declare global {
  interface Window {
    umami?: {
      track: (payload: (props: Record<string, unknown>) => Record<string, unknown>) => void;
    };
    plausible?: (event: "pageview", options: { u: string }) => void;
  }
}

/**
 * Cookieless page views (brief §10) with the operator's self-hosted Umami or
 * Plausible. Automatic tracking is off: each page view is sent by hand with
 * the cleaned path only (see core/analytics/page-views.ts), and without a
 * referrer from our own pages.
 */
export function PageAnalytics(props: { config: PageAnalyticsConfig }) {
  const { config } = props;
  const pathname = usePathname();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const path = pageViewPath(pathname);
    if (!loaded || !path) return;
    const external =
      document.referrer && !document.referrer.startsWith(window.location.origin)
        ? new URL(document.referrer).origin
        : "";
    if (config.provider === "umami") {
      window.umami?.track((current) => ({ ...current, url: path, referrer: external }));
    } else {
      window.plausible?.("pageview", { u: `${window.location.origin}${path}` });
    }
  }, [pathname, loaded, config.provider]);

  return config.provider === "umami" ? (
    <Script
      src={config.scriptUrl}
      data-website-id={config.websiteId}
      data-auto-track="false"
      data-do-not-track="true"
      strategy="afterInteractive"
      onLoad={() => setLoaded(true)}
    />
  ) : (
    <Script src={config.scriptUrl} strategy="afterInteractive" onLoad={() => setLoaded(true)} />
  );
}
