/**
 * File types from content, never from the name or the browser's claim
 * (brief §9, uploads). Only the first bytes are needed: SNIFF_BYTES.
 */

export type FileFamily = "pdf" | "image" | "svg" | "video" | "audio" | "font" | "text";

export interface SniffedType {
  mime: string;
  ext: string;
  family: FileFamily;
}

export const SNIFF_BYTES = 4100;

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  bytes.length >= offset + signature.length &&
  signature.every((byte, index) => bytes[offset + index] === byte);

function isoMedia(head: Uint8Array): SniffedType | null {
  if (head.length < 12 || ascii(head, 4, 4) !== "ftyp") return null;
  const brand = ascii(head, 8, 4);
  if (brand === "M4A " || brand === "M4B ")
    return { mime: "audio/mp4", ext: "m4a", family: "audio" };
  if (brand === "qt  ") return { mime: "video/quicktime", ext: "mov", family: "video" };
  if (brand === "avif" || brand === "avis")
    return { mime: "image/avif", ext: "avif", family: "image" };
  // HEIC photos: most browsers and our image pipeline cannot read them.
  if (["heic", "heix", "hevc", "mif1", "msf1"].includes(brand)) return null;
  return { mime: "video/mp4", ext: "mp4", family: "video" };
}

function matroska(head: Uint8Array): SniffedType | null {
  if (!startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) return null;
  return ascii(head, 0, Math.min(head.length, 64)).includes("webm")
    ? { mime: "video/webm", ext: "webm", family: "video" }
    : { mime: "video/x-matroska", ext: "mkv", family: "video" };
}

/** Valid UTF-8 without NUL bytes; tolerates a multi-byte character cut off at the end. */
export function looksLikeText(head: Uint8Array): boolean {
  if (head.includes(0)) return false;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let cut = 0; cut <= 3 && cut < head.length + 1; cut++) {
    try {
      decoder.decode(head.subarray(0, head.length - cut));
      return true;
    } catch {
      // try again without a possibly truncated trailing character
    }
  }
  return false;
}

function svg(head: Uint8Array): SniffedType | null {
  if (!looksLikeText(head)) return null;
  const text = new TextDecoder().decode(head).replace(/^﻿/, "");
  // Skip the XML declaration, comments and a doctype before the root element.
  const rest = text.replace(/^(\s|<\?xml[^>]*\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*/i, "");
  return /^<svg[\s>]/i.test(rest) ? { mime: "image/svg+xml", ext: "svg", family: "svg" } : null;
}

export function sniffFileType(head: Uint8Array): SniffedType | null {
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d]))
    return { mime: "application/pdf", ext: "pdf", family: "pdf" };
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { mime: "image/png", ext: "png", family: "image" };
  if (startsWith(head, [0xff, 0xd8, 0xff]))
    return { mime: "image/jpeg", ext: "jpg", family: "image" };
  if (ascii(head, 0, 6) === "GIF87a" || ascii(head, 0, 6) === "GIF89a")
    return { mime: "image/gif", ext: "gif", family: "image" };
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WEBP")
    return { mime: "image/webp", ext: "webp", family: "image" };
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WAVE")
    return { mime: "audio/wav", ext: "wav", family: "audio" };
  if (ascii(head, 0, 4) === "OggS") return { mime: "audio/ogg", ext: "ogg", family: "audio" };
  if (ascii(head, 0, 4) === "fLaC") return { mime: "audio/flac", ext: "flac", family: "audio" };
  if (
    ascii(head, 0, 3) === "ID3" ||
    (head.length >= 2 && head[0] === 0xff && (head[1]! & 0xe0) === 0xe0 && (head[1]! & 0x06) !== 0)
  )
    return { mime: "audio/mpeg", ext: "mp3", family: "audio" };
  if (ascii(head, 0, 4) === "wOF2") return { mime: "font/woff2", ext: "woff2", family: "font" };
  if (ascii(head, 0, 4) === "wOFF") return { mime: "font/woff", ext: "woff", family: "font" };
  if (ascii(head, 0, 4) === "OTTO") return { mime: "font/otf", ext: "otf", family: "font" };
  if (startsWith(head, [0x00, 0x01, 0x00, 0x00]) || ascii(head, 0, 4) === "true")
    return { mime: "font/ttf", ext: "ttf", family: "font" };
  const media = isoMedia(head) ?? matroska(head);
  if (media) return media;
  const image = svg(head);
  if (image) return image;
  if (head.length > 0 && looksLikeText(head))
    return { mime: "text/plain", ext: "txt", family: "text" };
  return null;
}

/** Markdown is plain text; the name decides how we label it. */
export function refineTextType(type: SniffedType, fileName: string): SniffedType {
  if (type.family !== "text") return type;
  return /\.(md|markdown)$/i.test(fileName)
    ? { mime: "text/markdown", ext: "md", family: "text" }
    : type;
}
