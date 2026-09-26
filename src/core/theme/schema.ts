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
  }),
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
