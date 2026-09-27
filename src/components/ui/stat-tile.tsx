import type { ReactNode } from "react";

/** Stat tile: sentence-case label, value in the body sans (never the display face). */
export function StatTile(props: {
  label: string;
  value: number;
  hint?: ReactNode;
  /** Number format, e.g. 1,2 Tsd. in German. */
  locale?: string;
}) {
  const compact = new Intl.NumberFormat(props.locale ?? "en", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  return (
    <div className="card-flat p-4">
      <p className="text-sm text-muted">{props.label}</p>
      <p className="mt-1 font-body text-3xl font-semibold">{compact.format(props.value)}</p>
      {props.hint && <p className="mt-1 text-sm text-muted">{props.hint}</p>}
    </div>
  );
}
