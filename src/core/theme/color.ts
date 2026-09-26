/** Minimal colour maths for picking readable text colours (WCAG 2.x contrast). */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHex(hex: string): Rgb {
  let value = hex.replace(/^#/, "");
  if (value.length === 3 || value.length === 4) {
    value = value
      .slice(0, 3)
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  const int = Number.parseInt(value.slice(0, 6), 16);
  if (Number.isNaN(int) || value.length < 6) throw new Error(`Invalid hex colour: ${hex}`);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function channel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

/** Returns whichever candidate reads best on the given background. */
export function mostReadable(background: string, candidates: readonly string[]): string {
  let best = candidates[0] ?? "#000000";
  let bestRatio = -1;
  for (const candidate of candidates) {
    const ratio = contrastRatio(background, candidate);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }
  return best;
}
