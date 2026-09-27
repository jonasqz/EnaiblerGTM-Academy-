import { slugify } from "@/core/shared/slug";

export type LessonProgressMap = Readonly<Record<string, { completedAt: string }>>;

/**
 * Stable key shared by the translations of one lesson, derived from its first
 * title and made unique within the course.
 */
export function lessonKeyFor(title: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  const base = slugify(title).slice(0, 48).replace(/-+$/, "") || "lesson";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function courseProgress(
  keys: readonly string[],
  progress: LessonProgressMap,
): { done: number; total: number; percent: number } {
  const done = keys.filter((key) => progress[key]).length;
  return {
    done,
    total: keys.length,
    percent: keys.length === 0 ? 0 : Math.round((done / keys.length) * 100),
  };
}

/** Where a learner continues: the first unfinished lesson (in order), or null when all are done. */
export function resumeLessonKey(
  keys: readonly string[],
  progress: LessonProgressMap,
): string | null {
  return keys.find((key) => !progress[key]) ?? null;
}

/** After finishing `current`: the next unfinished lesson after it, else any unfinished one. */
export function nextLessonKey(
  keys: readonly string[],
  progress: LessonProgressMap,
  current: string,
): string | null {
  const index = keys.indexOf(current);
  const after = keys.slice(index + 1).find((key) => !progress[key] && key !== current);
  return after ?? keys.find((key) => !progress[key] && key !== current) ?? null;
}

export function neighbours(
  keys: readonly string[],
  current: string,
): { previous: string | null; next: string | null } {
  const index = keys.indexOf(current);
  return {
    previous: index > 0 ? (keys[index - 1] ?? null) : null,
    next: index >= 0 && index < keys.length - 1 ? (keys[index + 1] ?? null) : null,
  };
}
