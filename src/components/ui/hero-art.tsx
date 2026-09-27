/**
 * Decorative shapes in the tenant's accent colours. Outlined themes get
 * stacked blocks with hard shadows, soft themes get overlapping discs.
 */
export function HeroArt(props: { colors: string[]; outlined: boolean }) {
  const colors = props.colors.length > 0 ? props.colors.slice(0, 4) : ["var(--tenant-primary)"];
  if (props.outlined) {
    return (
      <div aria-hidden className="relative h-48 w-full max-w-xs">
        {colors.map((color, index) => (
          <span
            key={index}
            className="absolute border-outline border-ink shadow-card"
            style={{
              background: color,
              width: `${46 - index * 6}%`,
              height: `${46 - index * 6}%`,
              left: `${index * 17}%`,
              top: `${(index % 2) * 34 + index * 6}%`,
            }}
          />
        ))}
      </div>
    );
  }
  return (
    <div aria-hidden className="relative h-48 w-full max-w-xs">
      {colors.map((color, index) => (
        <span
          key={index}
          className="absolute rounded-full opacity-80 mix-blend-multiply"
          style={{
            background: color,
            width: `${58 - index * 8}%`,
            aspectRatio: "1",
            left: `${index * 16}%`,
            top: `${(index % 2) * 22}%`,
            filter: "blur(2px)",
          }}
        />
      ))}
    </div>
  );
}
