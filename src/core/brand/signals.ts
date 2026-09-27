import { hslToHex, parseHex, rgbToHex } from "@/core/theme/color";

/*
 * Brand signals from a website's HTML and CSS: which colours, fonts, corner
 * radii and shadows it uses, and where. Pure string work (nothing is executed
 * or rendered), so it runs on untrusted input.
 */

export type ColorRole = "background" | "text" | "border" | "button" | "variable" | "theme";

export interface ColorSignal {
  hex: string;
  count: number;
  roles: ColorRole[];
  /** Custom properties that hold this colour, e.g. --brand-primary. */
  variables: string[];
}

export interface FontSignal {
  family: string;
  count: number;
  /** Uses in heading selectors (h1–h3, .title, .heading …). */
  headings: number;
}

export interface BrandSignals {
  colors: ColorSignal[];
  fonts: FontSignal[];
  /** Border radii in px (pills excluded). */
  radii: number[];
  borderWidths: number[];
  shadows: { hard: number; soft: number };
  themeColor: string | null;
}

const LIMIT_CSS = 2_000_000;

/** Absolute URLs of the page's stylesheets (http/https only), in document order. */
export function stylesheetUrls(html: string, baseUrl: string, max = 6): string[] {
  const urls: string[] = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel\s*=\s*["']?[^"'>]*\bstylesheet\b/i.test(tag)) continue;
    const href = /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(tag);
    const value = href?.[1] ?? href?.[2] ?? href?.[3];
    if (!value) continue;
    try {
      const url = new URL(value.replace(/&amp;/g, "&"), baseUrl);
      if (
        (url.protocol === "https:" || url.protocol === "http:") &&
        !urls.includes(url.toString())
      ) {
        urls.push(url.toString());
      }
    } catch {
      // Not a URL: skip.
    }
    if (urls.length >= max) break;
  }
  return urls;
}

/** <style> blocks and style="" attributes of the page, as CSS. */
export function inlineCss(html: string): string {
  const blocks = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(
    (match) => match[1] ?? "",
  );
  const attributes = [...html.matchAll(/\bstyle\s*=\s*"([^"]*)"/gi)].map(
    (match) => `[style]{${match[1] ?? ""}}`,
  );
  return [...blocks, ...attributes].join("\n");
}

export function metaThemeColor(html: string): string | null {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/\bname\s*=\s*["']?theme-color/i.test(tag)) continue;
    const content = /\bcontent\s*=\s*["']?([^"'>\s]+)/i.exec(tag)?.[1];
    const hex = content ? parseColor(content) : null;
    if (hex) return hex;
  }
  return null;
}

const NAMED: Record<string, string> = { white: "#ffffff", black: "#000000" };

/** One CSS colour value → opaque #rrggbb, or null (transparent, unknown, too translucent). */
export function parseColor(value: string): string | null {
  const text = value.trim().toLowerCase();
  if (NAMED[text]) return NAMED[text];
  const hex = /^#([0-9a-f]{3,8})$/.exec(text)?.[1];
  if (hex) {
    if (hex.length === 5 || hex.length === 7) return null;
    const alpha =
      hex.length === 4
        ? Number.parseInt(hex[3]! + hex[3]!, 16)
        : hex.length === 8
          ? Number.parseInt(hex.slice(6), 16)
          : 255;
    if (alpha < 128) return null;
    return rgbToHex(parseHex(`#${hex}`));
  }
  const fn = /^(rgba?|hsla?)\(((?:[^()]|\([^()]*\))*)\)$/.exec(text);
  if (!fn) return null;
  const parts = fn[2]!.split(/[\s,/]+/).filter(Boolean);
  const alphaPart = parts[3];
  if (alphaPart && !alphaPart.startsWith("var")) {
    const alpha = alphaPart.endsWith("%")
      ? Number.parseFloat(alphaPart) / 100
      : Number.parseFloat(alphaPart);
    if (Number.isFinite(alpha) && alpha < 0.5) return null;
  }
  const number = (part: string | undefined, scale: number) =>
    part === undefined
      ? Number.NaN
      : part.endsWith("%")
        ? (Number.parseFloat(part) / 100) * scale
        : Number.parseFloat(part);
  if (fn[1]!.startsWith("rgb")) {
    const [r, g, b] = [number(parts[0], 255), number(parts[1], 255), number(parts[2], 255)];
    return [r, g, b].every(Number.isFinite) ? rgbToHex({ r, g, b }) : null;
  }
  const h = Number.parseFloat(parts[0] ?? "");
  const s = number(parts[1], 1);
  const l = number(parts[2], 1);
  return [h, s, l].every(Number.isFinite) ? hslToHex(((h % 360) + 360) % 360, s, l) : null;
}

const COLOR_TOKEN =
  /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\((?:[^()]|\([^()]*\))*\)|\b(?:white|black)\b/g;

function colorsIn(value: string): string[] {
  return [...value.matchAll(COLOR_TOKEN)].flatMap((match) => {
    const hex = parseColor(match[0]);
    return hex ? [hex] : [];
  });
}

function pxValues(value: string): number[] {
  return [...value.matchAll(/(-?\d*\.?\d+)(px|rem|em)\b|(?:^|\s)(0)(?=\s|$)/g)].map((match) =>
    match[3] !== undefined ? 0 : Number.parseFloat(match[1]!) * (match[2] === "px" ? 1 : 16),
  );
}

const ICON_FONTS =
  /awesome|icon|glyph|material symbols|dashicons|icomoon|fontello|ionicons|remixicon/i;
const GENERIC_FONTS = new Set([
  "sans-serif",
  "serif",
  "monospace",
  "system-ui",
  "-apple-system",
  "blinkmacsystemfont",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "cursive",
  "fantasy",
  "inherit",
  "initial",
  "unset",
  "emoji",
  "math",
  "apple color emoji",
  "segoe ui emoji",
  "segoe ui symbol",
  "noto color emoji",
]);

/** The first real family of a font-family list ("Proxima Nova", Arial, sans-serif → Proxima Nova). */
export function primaryFamily(value: string): string | null {
  for (const raw of value.split(",")) {
    const family = raw
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\s*!important$/, "")
      .trim();
    if (
      !family ||
      family.startsWith("var(") ||
      GENERIC_FONTS.has(family.toLowerCase()) ||
      ICON_FONTS.test(family)
    )
      continue;
    return family;
  }
  return null;
}

const HEADING_SELECTOR = /(^|[\s,>+~])h[1-3]\b|title|heading|headline|display|hero/i;
const BUTTON_SELECTOR = /button|\bbtn|cta|\.primary\b|wp-block-button/i;
const BRAND_VARIABLE = /primary|brand|accent|main|highlight|cta|theme/i;

/** Colours, fonts, radii and shadows from CSS text (all stylesheets and inline CSS joined). */
export function extractSignals(css: string, themeColor: string | null = null): BrandSignals {
  const source = css.slice(0, LIMIT_CSS).replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1]!.trim(),
    declarations: match[2]!,
  }));

  const colors = new Map<string, ColorSignal>();
  const note = (hex: string, role: ColorRole, variable?: string, weight = 1) => {
    const entry = colors.get(hex) ?? { hex, count: 0, roles: [], variables: [] };
    entry.count += weight;
    if (!entry.roles.includes(role)) entry.roles.push(role);
    if (variable && !entry.variables.includes(variable)) entry.variables.push(variable);
    colors.set(hex, entry);
  };

  // Pass 1: custom properties, so var(--brand) in later rules resolves to its colour.
  const variables = new Map<string, string[]>();
  for (const { declarations } of rules) {
    for (const [, name, value] of declarations.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
      const found = colorsIn(value!);
      if (found.length > 0) variables.set(name!, found);
    }
  }
  for (const [name, found] of variables)
    for (const hex of found) note(hex, "variable", name, BRAND_VARIABLE.test(name) ? 3 : 1);

  const fonts = new Map<string, FontSignal>();
  const radii: number[] = [];
  const borderWidths: number[] = [];
  const shadows = { hard: 0, soft: 0 };

  // Pass 2: where colours, fonts and shapes are used.
  for (const { selector, declarations } of rules) {
    const isButton = BUTTON_SELECTOR.test(selector);
    for (const match of declarations.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)) {
      const property = match[1]!.toLowerCase();
      const value = match[2]!;
      if (property.startsWith("--")) continue;
      const referenced = [...value.matchAll(/var\(\s*(--[\w-]+)/g)].flatMap(
        (match) => variables.get(match[1]!) ?? [],
      );
      const used = [...colorsIn(value), ...referenced];

      if (property === "color") used.forEach((hex) => note(hex, isButton ? "button" : "text"));
      else if (property === "background" || property === "background-color")
        used.forEach((hex) =>
          note(hex, isButton ? "button" : "background", undefined, isButton ? 2 : 1),
        );
      else if (property.startsWith("border") && !property.includes("radius")) {
        used.forEach((hex) => note(hex, "border"));
        if (property === "border" || property === "border-width") {
          const width = pxValues(value)[0];
          if (width !== undefined && width > 0 && width <= 8) borderWidths.push(width);
        }
      } else if (property === "font-family" || property === "font") {
        // The `font` shorthand lists the families after the size: "700 16px/1.5 Proxima Nova, sans-serif".
        const families =
          property === "font"
            ? /\d[\d.]*(?:px|rem|em|pt|%)(?:\/[\d.]+(?:px|rem|em|%)?)?\s+(.+)$/.exec(value)?.[1]
            : value;
        const family = families ? primaryFamily(families) : null;
        if (family) {
          const entry = fonts.get(family.toLowerCase()) ?? { family, count: 0, headings: 0 };
          entry.count += 1;
          if (HEADING_SELECTOR.test(selector)) entry.headings += 1;
          fonts.set(family.toLowerCase(), entry);
        }
      } else if (property === "border-radius") {
        if (!value.includes("%")) {
          const radius = pxValues(value)[0];
          if (radius !== undefined && radius >= 0 && radius < 100) radii.push(radius);
        }
      } else if (property === "box-shadow" && !/^\s*none/.test(value)) {
        for (const layer of value.split(/,(?![^(]*\))/)) {
          const [x = 0, y = 0, blur = 0] = pxValues(layer);
          if (x === 0 && y === 0 && blur === 0) continue;
          if (blur === 0) shadows.hard += 1;
          else shadows.soft += 1;
        }
      }
    }
  }

  if (themeColor) note(themeColor, "theme", undefined, 5);
  return {
    colors: [...colors.values()].sort((a, b) => b.count - a.count),
    fonts: [...fonts.values()].sort((a, b) => b.count - a.count),
    radii,
    borderWidths,
    shadows,
    themeColor,
  };
}
