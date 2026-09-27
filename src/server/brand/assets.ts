import sharp from "sharp";

import type { Logo } from "@/core/theme/schema";
import type { Database } from "@/db/client";
import { fileBytes, fileUrl, loadFile, storeFile } from "@/server/files";

/*
 * Brand assets from uploads (brief §11: self-hosted, tenant brand in front).
 * The theme stores their /files/ addresses; the files route serves them from
 * the academy's own domain.
 */

/** Mail and share images need a raster: 128px tall is four times the mail size. */
const RASTER_HEIGHT = 128;

const LOGO_EXTENSIONS: Record<string, string> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/webp": "webp",
};

const FONT_EXTENSIONS: Record<string, string> = {
  "font/woff2": "woff2",
  "font/woff": "woff",
  "font/ttf": "ttf",
  "font/otf": "otf",
};

/**
 * A logo from an upload: shown as uploaded on the site; SVG and WebP logos
 * also get a PNG for mail clients and share images.
 */
export async function logoFromUpload(
  db: Database,
  tenantId: string,
  fileId: string,
  createdBy: string,
): Promise<Omit<Logo, "show_name"> | null> {
  const record = await loadFile(db, tenantId, fileId);
  const extension = record ? LOGO_EXTENSIONS[record.contentType] : undefined;
  if (!record || record.purpose !== "brand_logo" || !extension) return null;
  const bytes = Buffer.from(await fileBytes(record));
  const src = `${fileUrl(record)}.${extension}`;

  if (extension === "png") {
    const { width, height } = await sharp(bytes).metadata();
    return { src, ratio: width && height ? ratio(width, height) : undefined };
  }
  // Vector logos are drawn at a density that reaches the target height sharply.
  let density: number | undefined;
  if (extension === "svg") {
    const { height } = await sharp(bytes).metadata();
    density = Math.min(2400, Math.max(72, Math.ceil((72 * RASTER_HEIGHT) / (height || 72))));
  }
  const png = await sharp(bytes, density ? { density } : {})
    .resize({ height: RASTER_HEIGHT, fit: "inside" })
    .png()
    .toBuffer({ resolveWithObject: true });
  const stored = await storeFile(db, tenantId, {
    purpose: "brand_logo",
    body: new Uint8Array(png.data),
    name: record.name.replace(/\.\w+$/, "") + ".png",
    createdBy,
  });
  return {
    src,
    png: `${fileUrl(stored)}.png`,
    ratio: ratio(png.info.width, png.info.height),
  };
}

function ratio(width: number, height: number): number {
  return Math.min(20, Math.round((width / height) * 1000) / 1000);
}

/** The address of an uploaded font file, if the upload is one. */
export async function fontFromUpload(
  db: Database,
  tenantId: string,
  fileId: string,
): Promise<string | null> {
  const record = await loadFile(db, tenantId, fileId);
  const extension = record ? FONT_EXTENSIONS[record.contentType] : undefined;
  if (!record || record.purpose !== "brand_font" || !extension) return null;
  return `${fileUrl(record)}.${extension}`;
}
