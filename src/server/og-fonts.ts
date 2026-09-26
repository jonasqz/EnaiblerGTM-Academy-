import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { isBundledFont } from "@/core/theme/fonts";
import type { Theme } from "@/core/theme/schema";

/**
 * Fonts for server-rendered images (Satori reads woff/ttf, not woff2).
 * Files come from the bundled @fontsource packages; next.config.ts traces
 * them into the standalone build.
 */
const FILES: Record<string, { regular: string; bold?: string }> = {
  Inter: {
    regular: "inter/files/inter-latin-400-normal.woff",
    bold: "inter/files/inter-latin-700-normal.woff",
  },
  Rubik: {
    regular: "rubik/files/rubik-latin-400-normal.woff",
    bold: "rubik/files/rubik-latin-700-normal.woff",
  },
  Bungee: { regular: "bungee/files/bungee-latin-400-normal.woff" },
};

const cache = new Map<string, Promise<Buffer>>();

function load(file: string): Promise<Buffer> {
  let pending = cache.get(file);
  if (!pending) {
    pending = readFile(join(process.cwd(), "node_modules/@fontsource", file));
    cache.set(file, pending);
  }
  return pending;
}

export interface ImageFont {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: "normal";
}

/** "Display" and "Body" families for the image, from the theme (Inter when not bundled). */
export async function imageFonts(theme: Theme): Promise<ImageFont[]> {
  const pick = (family: string) => FILES[isBundledFont(family) ? family : "Inter"] ?? FILES.Inter!;
  const display = pick(theme.fonts.display);
  const body = pick(theme.fonts.body);
  return [
    { name: "Display", data: await load(display.regular), weight: 400, style: "normal" },
    { name: "Body", data: await load(body.regular), weight: 400, style: "normal" },
    { name: "Body", data: await load(body.bold ?? body.regular), weight: 700, style: "normal" },
  ];
}
