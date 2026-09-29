/*
 * Questions from a live Q&A as an authoring source (webinar brief §2.1,
 * "Q&A reuse"): a CSV export from the webinar tool or pasted text, each
 * question with an optional answer. Only questions and answers are kept:
 * asker names, e-mail addresses and times in the export are left out, and
 * e-mail addresses inside the text are masked (anonymity, CLAUDE.md §4).
 * Stored as Markdown ("## question" then the answer), like an interview, so
 * the same text serves retrieval, the source page and the FAQ draft.
 */

export interface QaPair {
  question: string;
  /** Null when nobody answered it live. */
  answer: string | null;
}

export const QA_LIMITS = {
  /** Characters of an export we read; larger ones are cut. */
  input: 1_000_000,
  pairs: 300,
  question: 1_000,
  answer: 4_000,
} as const;

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

function clean(text: string, max: number): string {
  return text.replace(EMAIL, "[e-mail]").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Cells of a CSV text (RFC 4180 quoting), with the given delimiter. */
export function csvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const QUESTION_HEADER = /^(?:questions?|frage|fragen|question text|frage text)$/i;
const ANSWER_HEADER = /^(?:answers?|answer\(s\)|antwort|antworten|antwort\(en\)|reply|replies)$/i;

/** Tool exports prefix answers with who gave them ("Answered by host: …"): only the text counts. */
function answerText(cell: string): string | null {
  const text = cell
    .replace(/^(?:live answered|answered live|live beantwortet)$/i, "")
    .replace(/^[^:]{0,60}\b(?:answered|antwortete|beantwortet)[^:]{0,40}:\s*/i, "")
    .trim();
  return text ? clean(text, QA_LIMITS.answer) : null;
}

function fromCsv(text: string): QaPair[] | null {
  for (const delimiter of [",", ";", "\t"]) {
    const rows = csvRows(text, delimiter);
    const headerAt = rows.findIndex((row) => row.some((cell) => QUESTION_HEADER.test(cell.trim())));
    if (headerAt < 0) continue;
    const header = rows[headerAt]!.map((cell) => cell.trim());
    const question = header.findIndex((cell) => QUESTION_HEADER.test(cell));
    const answer = header.findIndex((cell) => ANSWER_HEADER.test(cell));
    return rows.slice(headerAt + 1).flatMap((row) => {
      const asked = clean(row[question] ?? "", QA_LIMITS.question);
      if (!asked) return [];
      return [{ question: asked, answer: answer >= 0 ? answerText(row[answer] ?? "") : null }];
    });
  }
  return null;
}

const QUESTION_MARK = /^(?:q|question|frage|f)\s*[:.)]\s*/i;
const ANSWER_MARK = /^(?:a|answer|antwort)\s*[:.)]\s*/i;
/** Chat exports: "10:02:33 From Jane Doe to Everyone: …" — the time and the name go. */
const CHAT_PREFIX = /^\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s+(?:(?:from|von)\s+.+?\s*:\s*)?/i;
const LIST_PREFIX = /^(?:[-*•]\s+|\d{1,3}[.)]\s+)/;

/**
 * Marked text ("Q: …" / "A: …", also "Frage:" / "Antwort:") pairs by its
 * marks; unmarked text starts a question at every line that ends with "?"
 * and takes the lines after it as the answer.
 */
function fromText(text: string): QaPair[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(CHAT_PREFIX, "").replace(LIST_PREFIX, "").trim())
    .filter(Boolean);
  const marked = lines.some((line) => QUESTION_MARK.test(line));
  const pairs: Array<{ question: string[]; answer: string[] }> = [];
  for (const line of lines) {
    const startsQuestion = marked ? QUESTION_MARK.test(line) : /\?["”“]?$/.test(line);
    if (startsQuestion) {
      pairs.push({ question: [line.replace(QUESTION_MARK, "")], answer: [] });
      continue;
    }
    const current = pairs.at(-1);
    if (!current) continue;
    if (marked && ANSWER_MARK.test(line)) current.answer.push(line.replace(ANSWER_MARK, ""));
    else if (!marked || current.answer.length > 0) current.answer.push(line);
    // A marked question may run over several lines before its answer.
    else current.question.push(line);
  }
  return pairs.flatMap((pair) => {
    const question = clean(pair.question.join(" "), QA_LIMITS.question);
    if (!question) return [];
    const answer = clean(pair.answer.join(" "), QA_LIMITS.answer);
    return [{ question, answer: answer || null }];
  });
}

/** Same question asked twice (case, spaces, punctuation aside): the first answer found wins. */
function merged(pairs: readonly QaPair[]): QaPair[] {
  const byKey = new Map<string, QaPair>();
  for (const pair of pairs) {
    const key = pair.question
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
    const seen = byKey.get(key);
    if (!seen) byKey.set(key, { ...pair });
    else if (!seen.answer && pair.answer) seen.answer = pair.answer;
  }
  return [...byKey.values()];
}

/** Questions and answers from a Q&A export (CSV) or pasted text. */
export function parseQaExport(input: string): QaPair[] {
  const text = input.slice(0, QA_LIMITS.input).replace(/^﻿/, "");
  return merged(fromCsv(text) ?? fromText(text)).slice(0, QA_LIMITS.pairs);
}

/** The Q&A as source text: a heading per question, its answer below. */
export function qaText(pairs: readonly QaPair[]): string {
  return pairs
    .map((pair) => {
      const question = pair.question.replace(/^#+\s*/, "").replace(/\s+/g, " ");
      return pair.answer ? `## ${question}\n\n${pair.answer}` : `## ${question}`;
    })
    .join("\n\n");
}

/** The pairs back from the stored text. */
export function qaPairs(content: string): QaPair[] {
  return content
    .split(/^## /m)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [first, ...rest] = block.split("\n");
      const answer = rest.join("\n").trim();
      return { question: first!.trim(), answer: answer || null };
    });
}
