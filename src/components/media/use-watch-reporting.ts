"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createRangeTracker, type RangeTracker } from "@/core/media/ranges";

/** How often new watching is reported while the video plays. */
const REPORT_EVERY_MS = 15_000;
const ENDPOINT = "/api/media/progress";

export interface WatchResult {
  percent: number;
  watched: boolean;
}

/**
 * Watch tracking for both players (webinar brief §2.4): the ranges this page
 * view played go to the server every few seconds of new watching, on pause
 * and end, and with sendBeacon when the page goes away. Every report carries
 * all ranges, so a lost one costs nothing. Off for viewers who are not
 * signed in: then nothing is sent at all.
 */
export function useWatchReporting(options: {
  assetId: string;
  enabled: boolean;
  onRecorded?: (result: WatchResult) => void;
}) {
  const { assetId, enabled, onRecorded } = options;
  const [tracker] = useState<RangeTracker>(() => createRangeTracker());
  const state = useRef({ position: 0, duration: undefined as number | undefined, started: false });
  const recorded = useRef(onRecorded);
  useEffect(() => {
    recorded.current = onRecorded;
  }, [onRecorded]);

  const send = useCallback(
    (beacon: boolean) => {
      if (!enabled) return;
      const body = JSON.stringify({
        asset: assetId,
        ranges: tracker
          .ranges()
          .map(([start, end]) => [Math.floor(start * 10) / 10, Math.ceil(end * 10) / 10]),
        position: Math.floor(state.current.position * 10) / 10,
        ...(state.current.duration ? { duration: state.current.duration } : {}),
      });
      if (beacon && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
        return;
      }
      void fetch(ENDPOINT, {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
      })
        .then((response) => (response.ok ? (response.json() as Promise<WatchResult>) : null))
        .then((result) => {
          if (result) recorded.current?.(result);
        })
        .catch(() => undefined);
    },
    [assetId, enabled, tracker],
  );

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      if (tracker.takeChanged()) send(false);
    }, REPORT_EVERY_MS);
    const leave = () => {
      if (tracker.takeChanged()) send(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") leave();
    };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", onVisibility);
      // Leaving the lesson inside the app unmounts the player without a pagehide.
      leave();
    };
  }, [enabled, send, tracker]);

  // One object per player: its event listeners are set up once.
  return useMemo(
    () => ({
      tracker,
      /** Where the player is and how long the video is (an embed only knows once it plays). */
      at(position: number, duration?: number) {
        state.current.position = position;
        if (duration && Number.isFinite(duration)) state.current.duration = Math.round(duration);
      },
      /** The first play of this page view: the server records the start right away. */
      started() {
        if (state.current.started) return;
        state.current.started = true;
        send(false);
      },
      /** Paused or ended: a good moment to report what is new. */
      flush() {
        if (tracker.takeChanged()) send(false);
      },
    }),
    [send, tracker],
  );
}
