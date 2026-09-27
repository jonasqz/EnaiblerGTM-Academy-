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

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Hue in degrees, saturation and lightness in 0–1. */
export function toHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = parseHex(hex);
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn
      ? ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
      : max === gn
        ? ((bn - rn) / d + 2) * 60
        : ((rn - gn) / d + 4) * 60;
  return { h, s, l };
}

export function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex({ r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 });
}

/** Mixes `amount` (0–1) of `a` into `b`. */
export function mixHex(a: string, b: string, amount: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return rgbToHex({
    r: x.r * amount + y.r * (1 - amount),
    g: x.g * amount + y.g * (1 - amount),
    b: x.b * amount + y.b * (1 - amount),
  });
}
