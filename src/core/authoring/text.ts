/**
 * Source text for authoring (brief §7, step 2): readable text from web pages,
 * chunks for retrieval, and a small relevance ranking for when no embedding
 * model is configured.
 */

const BLOCKS_TO_DROP =
  /<(script|style|noscript|template|svg|nav|footer|header|aside|form|iframe)\b[\s\S]*?<\/\1>/gi;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name] ?? match);
}

/**
 * The readable part of a web page as Markdown-ish text: headings, paragraphs
 * and list items of <article> or <main> when there is one, else of <body>.
 */
export function readableText(html: string): { title: string | null; text: string } {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
    .replace(/\s+/g, " ")
    .trim();
  let body = html.replace(/<!--[\s\S]*?-->/g, "");
  const main =
    body.match(/<article\b[\s\S]*?<\/article>/i)?.[0] ??
    body.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ??
    body.match(/<body\b[\s\S]*?<\/body>/i)?.[0] ??
    body;
  body = main.replace(BLOCKS_TO_DROP, " ");
  const text = decodeEntities(
    body
      .replace(/<h([1-6])\b[^>]*>/gi, (_, level: string) => `\n\n${"#".repeat(Number(level))} `)
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<(br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/(p|div|section|li|tr|blockquote|pre|table|ul|ol)>/gi, "\n\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title: title || null, text };
}

export interface TextChunk {
  position: number;
  content: string;
}

/**
 * Splits text into chunks of about `size` characters at paragraph (then
 * sentence) boundaries, repeating the end of each chunk at the start of the
 * next so a thought is never cut in half.
 */
export function chunkText(text: string, size = 1_200, overlap = 150): TextChunk[] {
  const pieces = text
    .split(/\n{2,}/)
    .flatMap((paragraph) =>
      paragraph.length <= size
        ? [paragraph]
        : (paragraph.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) ?? []),
    )
    .map((piece) => piece.trim())
    .filter(Boolean)
    .flatMap((piece) => {
      // A single sentence longer than a chunk: hard split.
      const parts: string[] = [];
      for (let start = 0; start < piece.length; start += size)
        parts.push(piece.slice(start, start + size));
      return parts;
    });
  const chunks: TextChunk[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + piece.length + 2 > size) {
      chunks.push({ position: chunks.length, content: current });
      const tail = current.slice(-overlap);
      const boundary = tail.search(/\s/);
      current = boundary >= 0 ? tail.slice(boundary + 1) : "";
    }
    current = current ? `${current}\n\n${piece}` : piece;
  }
  if (current.trim()) chunks.push({ position: chunks.length, content: current });
  return chunks;
}

const STOP_WORDS = new Set(
  "a an and are as at be but by for from has have how in is it its of on or that the this to was what when which who why will with you your der die das und ist ein eine einen dem den des mit von zu im in auf für nicht sich du dein deine wie was wer".split(
    " ",
  ),
);

function terms(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .match(/\p{L}[\p{L}\p{N}-]{2,}/gu) ?? []
  ).filter((term) => !STOP_WORDS.has(term));
}

/**
 * Ranks chunks by how well they match a query (term overlap weighted by
 * rarity). Good enough to pick the source passages for one criterion when no
 * embedding model is configured.
 */
export function rankChunks<T extends { content: string }>(
  query: string,
  chunks: readonly T[],
): T[] {
  const wanted = new Set(terms(query));
  if (wanted.size === 0) return [...chunks];
  const documentFrequency = new Map<string, number>();
  const chunkTerms = chunks.map((chunk) => {
    const set = new Set(terms(chunk.content));
    for (const term of set) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    return set;
  });
  const scored = chunks.map((chunk, index) => {
    let score = 0;
    for (const term of wanted) {
      if (chunkTerms[index]!.has(term)) {
        score += Math.log(1 + chunks.length / (documentFrequency.get(term) ?? 1));
      }
    }
    return { chunk, score, index };
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((entry) => entry.chunk);
}
