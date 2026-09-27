/**
 * Open-source font families bundled with the app (self-hosted via @fontsource,
 * imported in src/app/fonts.ts, traced for certificate images in
 * next.config.ts). Academies pick from these by name; brand import maps a
 * website's fonts to the closest one, because a site's own web fonts are
 * usually licensed and cannot simply be copied. Other families need
 * an upload (`theme.fonts.files`, served from our storage) or
 * `theme.fonts.source_urls` pointing at self-hosted @font-face CSS.
 */
export type FontCategory = "sans" | "geometric" | "rounded" | "serif" | "display";

export interface BundledFont {
  family: string;
  /** @fontsource package id. */
  id: string;
  category: FontCategory;
  /** Weights shipped: 400 always, 700 unless the family has none. */
  bold: boolean;
}

export const FONT_LIBRARY: readonly BundledFont[] = [
  { family: "Inter", id: "inter", category: "sans", bold: true },
  { family: "Roboto", id: "roboto", category: "sans", bold: true },
  { family: "Open Sans", id: "open-sans", category: "sans", bold: true },
  { family: "Lato", id: "lato", category: "sans", bold: true },
  { family: "DM Sans", id: "dm-sans", category: "geometric", bold: true },
  { family: "Montserrat", id: "montserrat", category: "geometric", bold: true },
  { family: "Poppins", id: "poppins", category: "geometric", bold: true },
  { family: "Space Grotesk", id: "space-grotesk", category: "geometric", bold: true },
  { family: "Rubik", id: "rubik", category: "rounded", bold: true },
  { family: "Nunito", id: "nunito", category: "rounded", bold: true },
  { family: "Merriweather", id: "merriweather", category: "serif", bold: true },
  { family: "Playfair Display", id: "playfair-display", category: "serif", bold: true },
  { family: "Bungee", id: "bungee", category: "display", bold: false },
];

export const BUNDLED_FONT_FAMILIES = FONT_LIBRARY.map((font) => font.family);

/** Families an academy uploaded itself (theme.fonts.files), in upload order. */
export function uploadedFamilies(files: ReadonlyArray<{ family: string }>): string[] {
  return [...new Set(files.map((file) => file.family))];
}

export function bundledFont(family: string): BundledFont | undefined {
  const wanted = family.trim().toLowerCase();
  return FONT_LIBRARY.find((font) => font.family.toLowerCase() === wanted);
}

export function isBundledFont(family: string): boolean {
  return bundledFont(family) !== undefined;
}

/**
 * Closest bundled family for a font a website uses: the same family if we
 * ship it, otherwise one with the same character (serif, geometric, rounded…).
 */
export function closestBundledFont(family: string): string {
  const exact = bundledFont(family);
  if (exact) return exact.family;
  const name = family.toLowerCase();
  const has = (...words: string[]) => words.some((word) => name.includes(word));
  if (has("playfair", "didot", "bodoni", "abril", "dm serif", "display serif", "canela"))
    return "Playfair Display";
  if (
    has(
      "serif",
      "georgia",
      "times",
      "garamond",
      "baskerville",
      "merriweather",
      "lora",
      "caslon",
      "minion",
      "charter",
      "tiempos",
    ) &&
    !has("sans")
  )
    return "Merriweather";
  if (has("nunito", "quicksand", "varela", "comfortaa", "rounded", "fredoka", "baloo", "rubik"))
    return "Nunito";
  if (has("grotesk", "mono", "courier", "consolas", "menlo", "sfmono", "jetbrains", "ibm plex"))
    return "Space Grotesk";
  if (
    has(
      "montserrat",
      "gotham",
      "proxima",
      "metropolis",
      "raleway",
      "avenir",
      "futura",
      "gilroy",
      "sofia",
    )
  )
    return "Montserrat";
  if (
    has(
      "poppins",
      "circular",
      "product sans",
      "google sans",
      "manrope",
      "outfit",
      "urbanist",
      "lexend",
    )
  )
    return "Poppins";
  if (has("dm sans", "general sans", "satoshi", "plus jakarta", "work sans", "figtree"))
    return "DM Sans";
  if (has("open sans", "noto sans", "source sans", "segoe", "pt sans")) return "Open Sans";
  if (has("lato", "carlito", "calibri")) return "Lato";
  if (has("roboto", "arimo")) return "Roboto";
  if (has("black", "heavy", "poster", "bungee", "anton", "bebas", "oswald")) return "Bungee";
  return "Inter";
}

export const FONT_WEIGHT_NAMES: Record<number, string> = {
  100: "Thin",
  200: "Extra light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Extra bold",
  900: "Black",
};

// First match wins: "SemiBold" and "ExtraBold" before "Bold", "ExtraLight" before "Light".
const WEIGHT_WORDS: Array<[RegExp, number]> = [
  [/thin|hairline/i, 100],
  [/(extra|ultra)[-_ ]?light/i, 200],
  [/light/i, 300],
  [/medium/i, 500],
  [/(semi|demi)[-_ ]?bold/i, 600],
  [/(extra|ultra)[-_ ]?bold/i, 800],
  [/black|heavy/i, 900],
  [/bold/i, 700],
];

/**
 * Family, weight and style guessed from a font file's name
 * ("AcmeSans-SemiBoldItalic.woff2" → Acme Sans, 600, italic), as a starting
 * point the person uploading can correct.
 */
export function guessFontFace(fileName: string): {
  family: string;
  weight: number;
  style: "normal" | "italic";
} {
  const base = fileName.replace(/\.(woff2?|ttf|otf)$/i, "");
  const [first = ""] = base.split(/[-_.]/);
  const family =
    first
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[^A-Za-z0-9 _-]/g, "")
      .trim()
      .slice(0, 60) || "Brand";
  const rest = base.slice(first.length);
  const weight = WEIGHT_WORDS.find(([pattern]) => pattern.test(rest))?.[1] ?? 400;
  return { family, weight, style: /italic|oblique/i.test(rest) ? "italic" : "normal" };
}
