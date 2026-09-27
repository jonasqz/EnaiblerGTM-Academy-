import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { bundledFont, type BundledFont } from "@/core/theme/fonts";
import type { Theme } from "@/core/theme/schema";

/**
 * Fonts for server-rendered images (Satori reads woff/ttf, not woff2).
 * Files come from the bundled @fontsource packages; next.config.ts traces
 * them into the standalone build.
 */
function files(font: BundledFont): { regular: string; bold: string } {
  const file = (weight: 400 | 700) => `${font.id}/files/${font.id}-latin-${weight}-normal.woff`;
  return { regular: file(400), bold: file(font.bold ? 700 : 400) };
}

const cache = new Map<string, Promise<Buffer>>();

function load(file: string): Promise<Buffer> {
  let pending = cache.get(file);
  if (!pending) {
    // Not traced by the bundler (it would copy every @fontsource file into the
    // standalone build); next.config.ts traces exactly the files used here.
    pending = readFile(
      join(/* turbopackIgnore: true */ process.cwd(), "node_modules/@fontsource", file),
    );
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
  const pick = (family: string) => files(bundledFont(family) ?? bundledFont("Inter")!);
  const display = pick(theme.fonts.display);
  const body = pick(theme.fonts.body);
  return [
    { name: "Display", data: await load(display.regular), weight: 400, style: "normal" },
    { name: "Body", data: await load(body.regular), weight: 400, style: "normal" },
    { name: "Body", data: await load(body.bold), weight: 700, style: "normal" },
  ];
}
