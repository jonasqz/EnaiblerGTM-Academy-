"use client";

import { useId, useState, type KeyboardEvent } from "react";

import { useStudioText } from "@/components/studio/studio-text";
import { countTicks } from "@/core/media/retention";

const PLOT_HEIGHT = "12rem";

/**
 * Drop-off by minute (webinar brief §3): one column per minute of the video,
 * one hue, a clean count axis. Pointer and arrow keys show each minute's
 * value; the table below holds every value for anyone who prefers it.
 */
export function RetentionChart(props: { counts: number[]; title: string }) {
  const t = useStudioText();
  const uid = useId();
  const { counts } = props;
  const [active, setActive] = useState<number | null>(null);
  const ticks = countTicks(Math.max(...counts));
  const top = ticks.at(-1)!;
  const every = Math.max(1, Math.ceil(counts.length / 8));
  const labelled = (index: number) =>
    index === 0 || index === counts.length - 1 || (index + 1) % every === 0;
  const describe = (index: number) =>
    `${t.t("media.retention.minute", { n: index + 1 })}: ${t.n("media.retention.viewers", counts[index]!)}`;

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = counts.length - 1;
    const current = active ?? 0;
    const next =
      event.key === "ArrowRight"
        ? Math.min(last, current + 1)
        : event.key === "ArrowLeft"
          ? Math.max(0, current - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  };

  return (
    <figure className="space-y-4">
      <figcaption className="sr-only">
        {t.t("media.retention.caption", { title: props.title })}
      </figcaption>
      {/* Room above the plot for the readout of the minute in focus. */}
      <div className="flex gap-2 pt-14">
        {/* The count axis: clean steps, recessive. */}
        <div
          aria-hidden
          className="relative w-8 shrink-0 text-right text-xs text-muted tabular-nums"
          style={{ height: PLOT_HEIGHT }}
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${100 - (tick / top) * 100}%` }}
            >
              {t.number(tick)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            role="group"
            tabIndex={0}
            aria-label={`${t.t("media.retention.caption", { title: props.title })}. ${t.t("media.retention.explore")}`}
            aria-describedby={`${uid}-readout`}
            onKeyDown={onKey}
            onFocus={() => setActive((value) => value ?? 0)}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
            className="relative flex items-end border-b border-line"
            style={{ height: PLOT_HEIGHT }}
          >
            {ticks.slice(1).map((tick) => (
              <span
                key={tick}
                aria-hidden
                className="pointer-events-none absolute inset-x-0 border-t border-line"
                style={{ top: `${100 - (tick / top) * 100}%` }}
              />
            ))}
            {counts.map((count, index) => (
              <div
                key={index}
                onPointerEnter={() => setActive(index)}
                className={`relative flex h-full min-w-0 flex-1 items-end justify-center px-px ${
                  active === index ? "bg-subtle" : ""
                }`}
              >
                <span
                  className="block w-full max-w-6 rounded-t-[4px] bg-primary"
                  style={{ height: `${(count / top) * 100}%`, minHeight: count > 0 ? 2 : 0 }}
                />
                {/* The first and the last minute carry their value; the rest are in the readout and table. */}
                {(index === 0 || index === counts.length - 1) && (
                  <span
                    aria-hidden
                    className="absolute left-1/2 -translate-x-1/2 text-xs font-semibold tabular-nums"
                    style={{ bottom: `calc(${(count / top) * 100}% + 2px)` }}
                  >
                    {t.number(count)}
                  </span>
                )}
              </div>
            ))}
            {active !== null && (
              <div
                aria-hidden
                className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-control border border-line bg-card px-3 py-2 text-sm whitespace-nowrap shadow-card"
                style={{
                  left: `clamp(4rem, ${((active + 0.5) / counts.length) * 100}%, calc(100% - 4rem))`,
                }}
              >
                <span className="block font-semibold">
                  {t.n("media.retention.viewers", counts[active]!)}
                </span>
                <span className="block text-muted">
                  {t.t("media.retention.minute", { n: active + 1 })}
                </span>
              </div>
            )}
          </div>
          <div aria-hidden className="flex pt-1 text-xs text-muted tabular-nums">
            {counts.map((_, index) => (
              <span key={index} className="relative min-w-0 flex-1 text-center">
                {labelled(index) ? (
                  <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
                    {index + 1}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
          <p aria-hidden className="pt-5 text-center text-xs text-muted">
            {t.t("media.retention.axis")}
          </p>
        </div>
      </div>
      <p id={`${uid}-readout`} className="sr-only" aria-live="polite">
        {active !== null ? describe(active) : ""}
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">{t.t("media.retention.table")}</summary>
        <div className="table-wrap mt-2 max-h-72 overflow-y-auto">
          <table className="table">
            <caption className="sr-only">
              {t.t("media.retention.caption", { title: props.title })}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t.t("media.retention.column.minute")}</th>
                <th scope="col" className="num">
                  {t.t("media.retention.column.viewers")}
                </th>
              </tr>
            </thead>
            <tbody>
              {counts.map((count, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td className="num">{t.number(count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
