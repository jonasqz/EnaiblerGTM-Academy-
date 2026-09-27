import { z } from "zod";

/**
 * Theme tokens. Every value ends up inside a CSS custom property, so each one
 * is validated strictly (no free-form CSS) to rule out style injection.
 */

export const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Use a hex colour like #DD7F6C");

/** Lengths: a number means px (config shorthand `radius: 0`), or a string with px/rem/em. */
export const cssLengthSchema = z
  .union([z.number().min(0).max(200), z.string().regex(/^\d+(?:\.\d+)?(?:px|rem|em)?$/)])
  .transform((value) => {
    if (typeof value === "number") return `${value}px`;
    return /^\d+(?:\.\d+)?$/.test(value) ? `${value}px` : value;
  });

const signedCssLengthSchema = z
  .union([z.number().min(-200).max(200), z.string().regex(/^-?\d+(?:\.\d+)?(?:px|rem|em)?$/)])
  .transform((value) => {
    if (typeof value === "number") return `${value}px`;
    return /^-?\d+(?:\.\d+)?$/.test(value) ? `${value}px` : value;
  });

/** CSS family name as it appears in @font-face, e.g. "Bungee" or "Rubik". */
export const fontFamilySchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9 _-]*$/,
    "Font family names may only contain letters, digits, spaces, _ and -",
  );

/**
 * Hosts we refuse to load fonts from: loading Google Fonts from Google's CDN
 * transfers learner IP addresses to a third party (LG München, 2022). Fonts
 * must be self-hosted (bundled or served from our own storage).
 */
export const BLOCKED_FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

export const fontSourceUrlSchema = z
  .string()
  .refine((value) => {
    if (value.startsWith("/") && !value.startsWith("//")) return true;
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Use an https:// URL or a root-relative path to a stylesheet with @font-face rules")
  .refine((value) => {
    if (value.startsWith("/")) return true;
    return !BLOCKED_FONT_HOSTS.includes(new URL(value).hostname);
  }, "Self-host fonts: third-party font CDNs leak learner IP addresses");

/** A file in the academy's own storage, as the app serves it: /files/<id>.<ext>. */
function storedFileSchema(extensions: readonly string[], what: string) {
  const pattern = new RegExp(`^/files/[0-9a-f-]{36}\\.(?:${extensions.join("|")})$`);
  return z.string().regex(pattern, `Upload the ${what} in the brand editor`);
}

export const FONT_FILE_EXTENSIONS = ["woff2", "woff", "ttf", "otf"] as const;

/**
 * The academy's own font (licensed for the web), uploaded to our storage and
 * served from the academy's domain like everything else.
 */
export const fontFileSchema = z.strictObject({
  family: fontFamilySchema,
  weight: z.number().int().min(100).max(900).multipleOf(100).default(400),
  style: z.enum(["normal", "italic"]).default("normal"),
  src: storedFileSchema(FONT_FILE_EXTENSIONS, "font file"),
});
export type FontFile = z.output<typeof fontFileSchema>;

export const logoSchema = z.strictObject({
  /** As uploaded: SVG, PNG or WebP. */
  src: storedFileSchema(["svg", "png", "webp"], "logo"),
  /** PNG for mail and share images, rendered at upload when the logo is SVG or WebP. */
  png: storedFileSchema(["png"], "logo").optional(),
  /** Width ÷ height, so mail clients that ignore CSS still draw it undistorted. */
  ratio: z.number().positive().max(20).optional(),
  /** A symbol stands next to the academy name; a wordmark replaces it. */
  show_name: z.boolean().default(true),
});
export type Logo = z.output<typeof logoSchema>;

export const VISUAL_STYLES = ["soft", "outlined"] as const;
export type VisualStyle = (typeof VISUAL_STYLES)[number];

export const themeSchema = z.strictObject({
  colors: z.strictObject({
    /** Text, outlines and hard shadows. */
    ink: hexColorSchema,
    /** Page background. */
    surface: hexColorSchema,
    /** Card and panel background. */
    card: hexColorSchema,
    /** Primary actions and highlights. */
    primary: hexColorSchema,
    /** Text on primary; picked automatically for contrast when omitted. */
    on_primary: hexColorSchema.optional(),
    /** Secondary colours, e.g. one per path. */
    accents: z.array(hexColorSchema).max(12).default([]),
  }),
  fonts: z.strictObject({
    display: fontFamilySchema,
    body: fontFamilySchema,
    source_urls: z.array(fontSourceUrlSchema).max(6).default([]),
    /** Uploaded font files: one per weight and style of a family. */
    files: z.array(fontFileSchema).max(12).default([]),
  }),
  logo: logoSchema.optional(),
  radius: cssLengthSchema,
  border_width: cssLengthSchema,
  shadow: z.strictObject({
    x: signedCssLengthSchema,
    y: signedCssLengthSchema,
    blur: cssLengthSchema,
    spread: signedCssLengthSchema.optional(),
    color: hexColorSchema,
  }),
  /**
   * Interaction flavour on top of the tokens: "soft" (lift on hover) or
   * "outlined" (hard offset shadow that presses in on click).
   */
  visual_style: z.enum(VISUAL_STYLES).default("soft"),
});

export type ThemeInput = z.input<typeof themeSchema>;
export type Theme = z.output<typeof themeSchema>;
