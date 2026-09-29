"use client";

import { useSyncExternalStore } from "react";

import { formatWebinarTime } from "@/core/webinars/time";

const subscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverZone = () => null;

/**
 * The webinar's time in the viewer's own zone (webinar brief §3), worked out
 * in the browser: the server does not know the zone and must not guess it.
 * Nothing shows where the zones agree, or before the page has hydrated.
 */
export function LocalTime(props: {
  startsAt: string;
  durationMinutes: number;
  timeZone: string;
  locale: string;
  /** "Your time: {time}", with {time} left in. */
  label: string;
}) {
  const zone = useSyncExternalStore(subscribe, browserZone, serverZone);
  if (!zone) return null;
  const start = new Date(props.startsAt);
  const local = formatWebinarTime(start, props.durationMinutes, zone, props.locale);
  const theirs = formatWebinarTime(start, props.durationMinutes, props.timeZone, props.locale);
  if (local === theirs) return null;
  return <span className="block text-sm text-muted">{props.label.replace("{time}", local)}</span>;
}
