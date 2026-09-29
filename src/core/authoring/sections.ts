import { chunkText } from "@/core/authoring/text";
import { formatClock } from "@/core/authoring/transcript";

/*
 * Sources as sections the AI can cite and authors can recognise (webinar
 * brief §2.1): the chapters of a recording with their time spans, the
 * headed parts of a text (documents, web pages, interviews, Q&A), or
 * numbered parts where a text has no headings. Quiz drafts, the coverage map
 * and the assignment draft all say which section their material comes from.
 */

export interface SourceSection {
  sourceId: string;
  sourceTitle: string;
  /** 1-based position within its source. */
  index: number;
  title: string | null;
  /** Recordings: where the chapter starts and ends. */
  startSec?: number;
  endSec?: number;
  text: string;
}

export interface SectionSource {
  id: string;
  title: string;
  kind: string;
  transcript?: ReadonlyArray<{
    startSec: number;
    endSec: number;
    title?: string;
    text: string;
  }> | null;
  content?: string | null;
}

/** Longer parts are split: one section should fit a prompt next to many others. */
const SECTION_LIMIT = 2_500;

function headedParts(content: string): Array<{ title: string | null; text: string }> {
  const parts: Array<{ title: string | null; lines: string[] }> = [{ title: null, lines: [] }];
  for (const line of content.split("\n")) {
    const heading = /^#{1,3}\s+(.+?)\s*#*$/.exec(line.trim());
    if (heading) parts.push({ title: heading[1]!.trim(), lines: [] });
    else parts.at(-1)!.lines.push(line);
  }
  return parts
    .map((part) => ({ title: part.title, text: part.lines.join("\n").trim() }))
    .filter((part) => part.title || part.text);
}

/** A source's sections: chapters of a recording, headed or numbered parts of a text. */
export function sourceSections(source: SectionSource): SourceSection[] {
  const base = { sourceId: source.id, sourceTitle: source.title };
  if (source.transcript && source.transcript.length > 0) {
    return source.transcript.map((topic, index) => ({
      ...base,
      index: index + 1,
      title: topic.title?.trim() || null,
      startSec: topic.startSec,
      endSec: topic.endSec,
      text: topic.text,
    }));
  }
  const content = source.content?.trim() ?? "";
  if (!content) return [];
  const sections: SourceSection[] = [];
  for (const part of headedParts(content)) {
    const pieces =
      part.text.length > SECTION_LIMIT
        ? chunkText(part.text, SECTION_LIMIT, 0).map((chunk) => chunk.content)
        : [part.text];
    for (const text of pieces) {
      sections.push({ ...base, index: sections.length + 1, title: part.title, text });
    }
  }
  return sections;
}

/**
 * How authors find a section again: "Webinar · Pricing (12:30–18:05)",
 * "Playbook · Late fees", or "Playbook · #3" for a part without a heading.
 */
export function sectionLabel(section: SourceSection): string {
  const time =
    section.startSec !== undefined && section.endSec !== undefined
      ? `${formatClock(section.startSec)}–${formatClock(section.endSec)}`
      : null;
  const name = section.title ?? (time ? null : `#${section.index}`);
  const place = [name, time && name ? `(${time})` : time].filter(Boolean).join(" ");
  return `${section.sourceTitle} · ${place}`.slice(0, 200);
}

export interface SectionBudget {
  /** Characters of source text a prompt may carry in all. */
  total: number;
  /** Characters of one section. */
  each: number;
}

/**
 * Sections for a prompt, within budget, each source getting its turn so a
 * long recording does not crowd out a short document. Keeps the sources'
 * order and the sections' order within each source.
 */
export function sectionsWithinBudget(
  sections: readonly SourceSection[],
  budget: SectionBudget,
): SourceSection[] {
  const bySource = new Map<string, SourceSection[]>();
  for (const section of sections) {
    const list = bySource.get(section.sourceId) ?? [];
    list.push(section);
    bySource.set(section.sourceId, list);
  }
  const queues = [...bySource.values()];
  const picked = new Set<SourceSection>();
  let left = budget.total;
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (!next) continue;
      const size = Math.min(next.text.length, budget.each);
      if (size > left) continue;
      left -= size;
      picked.add(next);
      progressed = true;
    }
  }
  return sections
    .filter((section) => picked.has(section))
    .map((section) => ({ ...section, text: section.text.slice(0, budget.each) }));
}
