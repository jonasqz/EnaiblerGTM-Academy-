"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-renders the page every few seconds while background work runs (a
 * review, a transcription). Only while the tab is visible: a hidden tab
 * catches up the moment it is shown again, and a page nobody looks at does
 * not count as seen.
 */
export function AutoRefresh(props: { active: boolean; everyMs?: number; stopAfterMs?: number }) {
  const router = useRouter();
  const { active, everyMs = 3_000, stopAfterMs } = props;
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const tick = () => {
      if (stopAfterMs !== undefined && Date.now() - started > stopAfterMs) return;
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(tick, everyMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active, everyMs, stopAfterMs, router]);
  return null;
}
