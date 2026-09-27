import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { bundledFont, closestBundledFont, type BundledFont } from "@/core/theme/fonts";
import type { FontFile, Theme } from "@/core/theme/schema";

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

/** Reads an uploaded font file (`/files/<id>.<ext>`) of the academy, or null. */
export type UploadedFontLoader = (src: string) => Promise<Buffer | null>;

/** The academy's own file for a family and weight, in a format Satori reads. */
function uploadedFile(theme: Theme, family: string, weight: 400 | 700): FontFile | undefined {
  return theme.fonts.files
    .filter(
      (file) => file.family === family && file.style === "normal" && !file.src.endsWith(".woff2"),
    )
    .sort((a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight))[0];
}

/**
 * "Display" and "Body" families for the image, from the theme: the
 * academy's own font where it uploaded a .woff, .ttf or .otf, else the
 * bundled family (or the closest one).
 */
export async function imageFonts(
  theme: Theme,
  loadUploaded?: UploadedFontLoader,
): Promise<ImageFont[]> {
  const face = async (family: string, weight: 400 | 700): Promise<Buffer> => {
    const own = loadUploaded && uploadedFile(theme, family, weight);
    const data = own ? await loadUploaded(own.src).catch(() => null) : null;
    if (data) return data;
    const bundled = files(bundledFont(family) ?? bundledFont(closestBundledFont(family))!);
    return load(weight === 700 ? bundled.bold : bundled.regular);
  };
  return [
    { name: "Display", data: await face(theme.fonts.display, 400), weight: 400, style: "normal" },
    { name: "Body", data: await face(theme.fonts.body, 400), weight: 400, style: "normal" },
    { name: "Body", data: await face(theme.fonts.body, 700), weight: 700, style: "normal" },
  ];
}
