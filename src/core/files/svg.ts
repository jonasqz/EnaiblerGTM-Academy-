/**
 * Uploaded SVGs (logos, path visuals) are shown with <img>, where scripts
 * never run, and served as downloads with a sandbox policy. On top of that we
 * refuse anything active or external: scripts, event handlers, embedded
 * documents, entities, and references outside the file (which could track
 * viewers or make the rasteriser read other files).
 */
const FORBIDDEN: ReadonlyArray<[RegExp, string]> = [
  [/<!ENTITY/i, "entities"],
  [/<\s*(script|foreignObject|iframe|embed|object|handler|listener)\b/i, "active content"],
  [/\son[a-z]+\s*=/i, "event handlers"],
  [/(javascript|vbscript)\s*:/i, "script links"],
  [/@import/i, "style imports"],
];

/** Only same-document references (#id) and embedded raster images are allowed. */
const REFERENCE =
  /(?:\b(?:xlink:)?href\s*=\s*["']([^"']*)["'])|(?:url\(\s*["']?([^"')]*)["']?\s*\))/gi;
const ALLOWED_REFERENCE = /^(#[\w.-]*|data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]*)$/i;

export function svgIssue(source: string): string | null {
  for (const [pattern, what] of FORBIDDEN) {
    if (pattern.test(source)) return `SVG contains ${what}`;
  }
  for (const match of source.matchAll(REFERENCE)) {
    const target = (match[1] ?? match[2] ?? "").trim();
    if (target && !ALLOWED_REFERENCE.test(target)) return "SVG refers to other files or websites";
  }
  if (!/<svg[\s>]/i.test(source)) return "Not an SVG image";
  return null;
}
