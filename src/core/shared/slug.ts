import { z } from "zod";

/** Lower-case, URL-safe identifier used for tenants, paths, courses and lesson keys. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(SLUG_PATTERN, "Use lower-case letters, digits and single hyphens (e.g. validation-lab)");

const TRANSLITERATIONS: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  ß: "ss",
  æ: "ae",
  ø: "o",
  å: "a",
};

/** Derives a slug from a human title: "Market Sizing mit KI" → "market-sizing-mit-ki". */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[äöüßæøå]/g, (ch) => TRANSLITERATIONS[ch] ?? ch)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
}
