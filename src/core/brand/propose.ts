import type { BrandSignals, ColorSignal } from "@/core/brand/signals";
import { contrastRatio, mixHex, relativeLuminance, toHsl } from "@/core/theme/color";
import { themeContrastIssues } from "@/core/theme/contrast";
import { closestBundledFont } from "@/core/theme/fonts";
import { themeSchema, type ThemeInput } from "@/core/theme/schema";

/*
 * Brand signals → a theme proposal the customer reviews in the Studio. The
 * rules favour what a site uses on purpose (brand variables, buttons,
 * theme-color) over what merely appears often, and always end readable:
 * the academy starts light, text meets WCAG contrast, fonts are ones we host.
 */

/** What the proposal wants the customer to check, worded by the Studio in their language. */
export type ProposalNote =
  { code: "no_brand_color" } | { code: "dark_site" } | { code: "font"; site: string; font: string };

export interface ThemeProposal {
  theme: ThemeInput;
  notes: ProposalNote[];
}

const DEFAULT_PRIMARY = "#3b5bdb";
const DEFAULT_INK = "#1d2024";

function isChromatic(hex: string): boolean {
  const { s, l } = toHsl(hex);
  return s >= 0.35 && l >= 0.18 && l <= 0.82;
}

function hueDistance(a: string, b: string): number {
  const d = Math.abs(toHsl(a).h - toHsl(b).h) % 360;
  return d > 180 ? 360 - d : d;
}

/** How strongly a colour reads as the brand colour. */
function brandScore(color: ColorSignal): number {
  let score = color.count;
  if (color.roles.includes("button")) score += 6;
  if (color.roles.includes("theme")) score += 8;
  if (color.variables.some((name) => /primary|brand|accent|main|cta/i.test(name))) score += 10;
  return score;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function proposeTheme(signals: BrandSignals): ThemeProposal {
  const notes: ProposalNote[] = [];
  const colors = signals.colors;

  // Brand colours: chromatic ones, strongest first, with distinct hues.
  const chromatic = colors
    .filter((color) => isChromatic(color.hex))
    .sort((a, b) => brandScore(b) - brandScore(a));
  const primary = chromatic[0]?.hex ?? DEFAULT_PRIMARY;
  if (!chromatic[0]) notes.push({ code: "no_brand_color" });
  const accents: string[] = [];
  for (const color of chromatic.slice(1)) {
    if ([primary, ...accents].every((hex) => hueDistance(hex, color.hex) >= 25))
      accents.push(color.hex);
    if (accents.length === 3) break;
  }

  // Surface and cards: the site's light background; a white site gets a faint tint so cards stand out.
  const backgrounds = colors.filter((color) => color.roles.includes("background"));
  const light = backgrounds.find((color) => relativeLuminance(color.hex) > 0.8)?.hex;
  const darkSite = backgrounds[0] !== undefined && relativeLuminance(backgrounds[0].hex) < 0.2;
  if (darkSite) notes.push({ code: "dark_site" });
  let surface = light ?? "#f7f7f5";
  let card = "#ffffff";
  if (relativeLuminance(surface) > 0.97) surface = mixHex(primary, "#f6f6f4", 0.04);
  else if (relativeLuminance(surface) > relativeLuminance(card) - 0.01)
    card = mixHex("#ffffff", surface, 0.6);

  // Text: the site's most used near-neutral dark text colour (not a link colour) that reads on the new surface.
  const ink =
    colors.find(
      (color) =>
        color.roles.includes("text") &&
        toHsl(color.hex).s < 0.6 &&
        relativeLuminance(color.hex) < 0.1 &&
        contrastRatio(color.hex, surface) >= 7 &&
        contrastRatio(color.hex, card) >= 7,
    )?.hex ?? DEFAULT_INK;

  // Fonts: what headings and body text use, mapped to the closest family we host.
  const body = signals.fonts[0]?.family;
  const heading = [...signals.fonts].sort((a, b) => b.headings - a.headings)[0];
  const display = heading && heading.headings > 0 ? heading.family : body;
  const bodyFont = body ? closestBundledFont(body) : "Inter";
  const displayFont = display ? closestBundledFont(display) : bodyFont;
  for (const [site, ours] of [
    [display, displayFont],
    [body, bodyFont],
  ] as const) {
    if (
      site &&
      site.toLowerCase() !== ours.toLowerCase() &&
      !notes.some((note) => note.code === "font" && note.site === site)
    ) {
      notes.push({ code: "font", site, font: ours });
    }
  }

  // Shape: typical corner radius, border weight and shadow character.
  const radius = Math.round(Math.min(24, Math.max(0, median(signals.radii) ?? 10)));
  const thick = signals.borderWidths.filter((width) => width >= 2).length;
  const borderWidth = thick > signals.borderWidths.length / 2 && thick >= 2 ? 2 : 1;
  const hard = signals.shadows.hard >= 2 && signals.shadows.hard > signals.shadows.soft;
  const outlined = hard && (borderWidth >= 2 || radius <= 4);
  const shadow = hard
    ? { x: "4px", y: "4px", blur: "0px", color: ink }
    : signals.shadows.soft > 0 || signals.shadows.hard === 0
      ? { x: "0px", y: "8px", blur: "24px", color: `${ink}1f` }
      : { x: "0px", y: "0px", blur: "0px", color: "#00000000" };

  const theme: ThemeInput = {
    colors: { ink, surface, card, primary, accents },
    fonts: { display: displayFont, body: bodyFont },
    radius: `${radius}px`,
    border_width: `${borderWidth}px`,
    shadow,
    visual_style: outlined ? "outlined" : "soft",
  };

  // Last guard: whatever the site does, the academy stays readable.
  const parsed = themeSchema.parse(theme);
  if (
    themeContrastIssues(parsed).some(
      (issue) => issue.code !== "text_on_primary" && issue.severity === "error",
    )
  ) {
    theme.colors = { ...theme.colors, ink: DEFAULT_INK, surface: "#f7f7f5", card: "#ffffff" };
  }
  return { theme, notes };
}
