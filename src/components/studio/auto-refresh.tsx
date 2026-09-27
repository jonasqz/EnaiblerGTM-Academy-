"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the page every few seconds while background work is running. */
export function AutoRefresh(props: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!props.active) return;
    const timer = setInterval(() => router.refresh(), props.everyMs ?? 3_000);
    return () => clearInterval(timer);
  }, [props.active, props.everyMs, router]);
  return null;
}
