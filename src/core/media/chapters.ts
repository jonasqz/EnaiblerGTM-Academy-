/**
 * Chapters of a re-live (webinar brief §2.4): where each topic starts and
 * what it is called. They come from the recording pipeline's topic
 * segmentation (core/authoring/transcript); authors rename them in the Studio.
 */
export interface Chapter {
  startSec: number;
  /** Empty when nobody named it yet: the player shows "Chapter n". */
  title: string;
}

export const MAX_CHAPTER_TITLE = 120;
/** Chapters closer together than this are one: a topic needs time to be one. */
const MIN_CHAPTER_GAP_SEC = 5;

/** Chapters in order, the first one at the start, none past the end or on top of another. */
export function normalizeChapters(
  topics: ReadonlyArray<{ startSec: number; title?: string | null }>,
  durationSec?: number | null,
): Chapter[] {
  const chapters: Chapter[] = [];
  const sorted = topics
    .filter((topic) => Number.isFinite(topic.startSec) && topic.startSec >= 0)
    .filter((topic) => !(durationSec && topic.startSec >= durationSec))
    .sort((a, b) => a.startSec - b.startSec);
  for (const topic of sorted) {
    const title = (topic.title ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CHAPTER_TITLE);
    const previous = chapters.at(-1);
    if (previous && topic.startSec - previous.startSec < MIN_CHAPTER_GAP_SEC) {
      previous.title ||= title;
      continue;
    }
    chapters.push({ startSec: Math.round(topic.startSec * 10) / 10, title });
  }
  if (chapters[0]) chapters[0].startSec = 0;
  // A single chapter tells the viewer nothing.
  return chapters.length > 1 ? chapters : [];
}

/** The chapter playing at `time`, or -1 before the first. */
export function chapterAt(chapters: readonly Chapter[], time: number): number {
  let index = -1;
  for (const [position, chapter] of chapters.entries()) {
    if (chapter.startSec <= time) index = position;
    else break;
  }
  return index;
}

/** New titles for the existing chapters (the Studio renames, it does not move them). */
export function renameChapters(
  chapters: readonly Chapter[],
  titles: readonly string[],
): Chapter[] | null {
  if (titles.length !== chapters.length) return null;
  return chapters.map((chapter, index) => ({
    startSec: chapter.startSec,
    title: titles[index]!.replace(/\s+/g, " ").trim().slice(0, MAX_CHAPTER_TITLE),
  }));
}
