"use client";

import { useSyncExternalStore } from "react";

import { formatDeadline } from "@/core/assignments/deadline";

const subscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverZone = () => null;

/**
 * A deadline in the viewer's own zone, worked out in the browser like a
 * webinar's time (components/webinars/local-time): nothing where the zones
 * agree, or before the page has hydrated.
 */
export function LocalDeadline(props: {
  dueAt: string;
  timeZone: string;
  locale: string;
  /** "Your time: {time}", with {time} left in. */
  label: string;
}) {
  const zone = useSyncExternalStore(subscribe, browserZone, serverZone);
  if (!zone) return null;
  const due = new Date(props.dueAt);
  const local = formatDeadline(due, zone, props.locale);
  if (local === formatDeadline(due, props.timeZone, props.locale)) return null;
  return <span className="block text-sm text-muted">{props.label.replace("{time}", local)}</span>;
}
