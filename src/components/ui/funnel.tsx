const numbers = new Intl.NumberFormat("en");

export interface FunnelRow {
  label: string;
  count: number;
}

/**
 * Horizontal bar list for ordered steps: one series, one hue (the tenant's
 * primary), values as text at the bar tip, conversion from the previous step
 * as secondary text. The list doubles as the table view.
 */
export function Funnel(props: { rows: FunnelRow[]; caption: string }) {
  const max = Math.max(1, ...props.rows.map((row) => row.count));
  return (
    <figure className="space-y-2">
      <figcaption className="sr-only">{props.caption}</figcaption>
      <ol className="space-y-3">
        {props.rows.map((row, index) => {
          const previous = index > 0 ? props.rows[index - 1]!.count : null;
          const rate = previous ? Math.round((row.count / previous) * 100) : null;
          return (
            <li
              key={row.label}
              className="grid grid-cols-[minmax(7rem,11rem)_1fr] items-center gap-3"
              title={`${row.label}: ${numbers.format(row.count)}${rate !== null ? ` (${rate}% of previous step)` : ""}`}
            >
              <span className="truncate text-sm">{row.label}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="bar" style={{ width: `${(row.count / max) * 80}%` }} />
                <span className="text-sm font-semibold tabular-nums">
                  {numbers.format(row.count)}
                </span>
                {rate !== null && <span className="text-xs text-muted">{rate}%</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
