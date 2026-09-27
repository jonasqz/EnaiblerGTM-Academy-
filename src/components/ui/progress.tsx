/** Progress meter: the fill and a lighter step of the same hue as the track. */
export function Progress(props: { value: number; label: string; className?: string }) {
  const value = Math.max(0, Math.min(100, Math.round(props.value)));
  return (
    <div
      className={`progress ${props.className ?? ""}`}
      role="progressbar"
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}
