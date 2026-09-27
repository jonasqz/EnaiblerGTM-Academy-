import { mostReadable } from "@/core/theme/color";
import type { Theme } from "@/core/theme/schema";

/**
 * Tenant tokens → CSS custom properties. The root layout puts these on
 * <html style>; `src/app/globals.css` maps them into Tailwind's theme
 * (`bg-primary`, `rounded-card`, `shadow-card`, `font-display`, …).
 */
export type ThemeCssVariables = Record<`--tenant-${string}`, string>;

const SANS_FALLBACK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

export function fontStack(family: string): string {
  return `"${family}", ${SANS_FALLBACK}`;
}

export function themeToCssVariables(theme: Theme): ThemeCssVariables {
  const { colors, fonts, shadow } = theme;
  const onPrimary = colors.on_primary ?? mostReadable(colors.primary, [colors.ink, "#FFFFFF"]);
  const shadowValue = [shadow.x, shadow.y, shadow.blur, shadow.spread, shadow.color]
    .filter((part) => part !== undefined)
    .join(" ");

  const variables: ThemeCssVariables = {
    "--tenant-ink": colors.ink,
    "--tenant-surface": colors.surface,
    "--tenant-card": colors.card,
    "--tenant-primary": colors.primary,
    "--tenant-on-primary": onPrimary,
    "--tenant-font-display": fontStack(fonts.display),
    "--tenant-font-body": fontStack(fonts.body),
    "--tenant-radius": theme.radius,
    "--tenant-border-width": theme.border_width,
    // Outlined themes draw ink outlines; soft themes use a faint hairline.
    "--tenant-border-color":
      theme.visual_style === "outlined"
        ? colors.ink
        : `color-mix(in srgb, ${colors.ink} 14%, transparent)`,
    "--tenant-shadow": shadowValue,
    "--tenant-shadow-x": shadow.x,
    "--tenant-shadow-y": shadow.y,
    ...interactionVariables(theme, shadowValue),
  };
  colors.accents.forEach((accent, index) => {
    variables[`--tenant-accent-${index + 1}`] = accent;
  });
  return variables;
}

/**
 * How hover and press feel, as variables rather than selectors, so a subtree
 * with another theme (the Studio, the brand preview) behaves like that theme.
 * Soft themes lift; outlined themes shift against their hard shadow and press in.
 */
function interactionVariables(theme: Theme, shadowValue: string): ThemeCssVariables {
  const { ink } = theme.colors;
  const { x, y } = theme.shadow;
  if (theme.visual_style === "outlined") {
    return {
      "--tenant-hover-shift": "-1px -1px",
      "--tenant-lift-shift": "-2px -2px",
      "--tenant-lift-shadow": `calc(${x} + 2px) calc(${y} + 2px) 0 ${ink}`,
      "--tenant-press-shift": `${x} ${y}`,
      "--tenant-press-shadow": "none",
    };
  }
  return {
    "--tenant-hover-shift": "0 -1px",
    "--tenant-lift-shift": "0 -2px",
    "--tenant-lift-shadow": `0 12px 32px color-mix(in srgb, ${ink} 12%, transparent)`,
    "--tenant-press-shift": "0 0",
    "--tenant-press-shadow": shadowValue,
  };
}

/** Colour for the n-th path: its own colour, else cycle through the accents. */
export function pathColor(theme: Theme, index: number, own?: string | null): string {
  if (own) return own;
  const { accents, primary } = theme.colors;
  return accents.length > 0 ? (accents[index % accents.length] ?? primary) : primary;
}
