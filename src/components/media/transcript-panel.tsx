"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { TimedText } from "@/core/authoring/transcript";
import { clockTime, cueAt, parseWebVtt, searchCues } from "@/core/media/captions";

export interface TranscriptLabels {
  search: string;
  /** With {n}. */
  matches: string;
  /** With {query}. */
  noMatches: string;
  loading: string;
  missing: string;
  /** With {time}. */
  jumpTo: string;
}

/**
 * The searchable transcript next to the player: the captions' own cues,
 * read from the same access-checked WebVTT file. A click plays from that
 * line; the line playing now is marked and kept in view while nobody searches.
 */
export function TranscriptPanel(props: {
  id: string;
  src: string | null;
  time: number;
  labels: TranscriptLabels;
  onSeek: (seconds: number) => void;
}) {
  const [cues, setCues] = useState<TimedText[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const list = useRef<HTMLOListElement>(null);
  const searchId = useId();

  useEffect(() => {
    if (!props.src) return;
    let cancelled = false;
    fetch(props.src, { credentials: "same-origin" })
      .then((response) => (response.ok ? response.text() : Promise.reject(response.status)))
      .then((text) => {
        if (!cancelled) setCues(parseWebVtt(text));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [props.src]);

  const found = useMemo(() => (cues ? searchCues(cues, query) : []), [cues, query]);
  const current = cues ? cueAt(cues, props.time) : -1;
  const searching = query.trim().length > 0;

  // Scrolls the list itself, never the page: the viewer may be reading elsewhere.
  useEffect(() => {
    if (searching || current < 0 || !list.current) return;
    const item = list.current.querySelector<HTMLElement>(`[data-cue="${current}"]`);
    if (!item) return;
    const box = list.current;
    if (
      item.offsetTop < box.scrollTop ||
      item.offsetTop + item.offsetHeight > box.scrollTop + box.clientHeight
    ) {
      box.scrollTop = item.offsetTop - box.clientHeight / 3;
    }
  }, [current, searching]);

  if (!props.src || failed) return <p className="p-4 text-sm text-muted">{props.labels.missing}</p>;
  if (!cues) {
    return (
      <p className="p-4 text-sm text-muted" role="status">
        {props.labels.loading}
      </p>
    );
  }

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          {props.labels.search}
        </label>
        <Search
          aria-hidden
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
        />
        <input
          id={searchId}
          type="search"
          className="input pl-9"
          placeholder={props.labels.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-controls={props.id}
        />
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {searching
          ? found.length > 0
            ? props.labels.matches.replace("{n}", String(found.length))
            : props.labels.noMatches.replace("{query}", query.trim())
          : ""}
      </p>
      {searching && found.length === 0 ? (
        <p className="text-sm text-muted">
          {props.labels.noMatches.replace("{query}", query.trim())}
        </p>
      ) : (
        // Padding keeps the focus ring of the first and last line inside the scrolling list.
        <ol ref={list} id={props.id} className="relative max-h-80 space-y-0.5 overflow-y-auto p-1">
          {found.map((index) => {
            const cue = cues[index]!;
            const time = clockTime(cue.start);
            return (
              <li key={index} data-cue={index}>
                <button
                  type="button"
                  onClick={() => props.onSeek(cue.start)}
                  aria-current={index === current ? "true" : undefined}
                  aria-label={`${props.labels.jumpTo.replace("{time}", time)}: ${cue.text}`}
                  className={`flex w-full gap-3 rounded-control px-2 py-1.5 text-left text-sm ${
                    index === current ? "bg-primary-soft" : "hover:bg-subtle"
                  }`}
                >
                  <span className="w-12 shrink-0 text-muted tabular-nums">{time}</span>
                  <span className="min-w-0">{cue.text}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
