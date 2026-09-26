import { z } from "zod";

import { localizedTextInputSchema, type LocalizedText } from "@/core/i18n/locales";

/**
 * Level rules (brief §4, LevelScheme). Config may use the short string form
 * from Appendix A ("courses_completed_in_path >= 2") or the object form.
 */
export type LevelRule =
  | { type: "courses_completed_in_path"; min: number }
  | { type: "path_complete" }
  | { type: "manual_grant" };

const COURSES_COMPLETED = /^courses_completed_in_path\s*>=\s*(\d+)$/;

export function parseLevelRule(input: string): LevelRule | null {
  const text = input.trim();
  if (text === "path_complete") return { type: "path_complete" };
  if (text === "manual_grant") return { type: "manual_grant" };
  const match = COURSES_COMPLETED.exec(text);
  if (match?.[1]) {
    const min = Number.parseInt(match[1], 10);
    return min >= 1 ? { type: "courses_completed_in_path", min } : null;
  }
  return null;
}

export function formatLevelRule(rule: LevelRule): string {
  return rule.type === "courses_completed_in_path"
    ? `courses_completed_in_path >= ${rule.min}`
    : rule.type;
}

const levelRuleObjectSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("courses_completed_in_path"), min: z.number().int().min(1) }),
  z.strictObject({ type: z.literal("path_complete") }),
  z.strictObject({ type: z.literal("manual_grant") }),
]);

export const levelRuleSchema = z.union([
  z.string().transform((value, ctx): LevelRule => {
    const rule = parseLevelRule(value);
    if (!rule) {
      ctx.addIssue({
        code: "custom",
        message:
          'Unknown level rule. Use "courses_completed_in_path >= <n>", "path_complete" or "manual_grant"',
      });
      return z.NEVER;
    }
    return rule;
  }),
  levelRuleObjectSchema,
]);

export interface LevelDefinition {
  n: number;
  name: LocalizedText;
  rule: LevelRule;
}

export const levelDefinitionSchema = z.strictObject({
  n: z.number().int().min(1).max(20),
  name: localizedTextInputSchema,
  rule: levelRuleSchema,
});

/** Levels must be numbered 1..N without gaps. */
export const levelSchemeSchema = z
  .array(levelDefinitionSchema)
  .max(20)
  .superRefine((levels, ctx) => {
    const numbers = levels.map((level) => level.n).sort((a, b) => a - b);
    numbers.forEach((n, index) => {
      if (n !== index + 1) {
        ctx.addIssue({
          code: "custom",
          message: "Levels must be numbered 1, 2, 3, … without gaps or duplicates",
        });
      }
    });
  })
  .transform((levels) => [...levels].sort((a, b) => a.n - b.n));

export interface PathProgress {
  /** Ordered course ids of the learner's path. */
  pathCourseIds: readonly string[];
  /** Course ids the learner has completed (any path). */
  completedCourseIds: readonly string[];
  /** Level numbers granted manually (e.g. "Mentor"). */
  grantedLevels?: readonly number[];
}

export function isRuleSatisfied(rule: LevelRule, n: number, progress: PathProgress): boolean {
  const completed = new Set(progress.completedCourseIds);
  const completedInPath = progress.pathCourseIds.filter((id) => completed.has(id)).length;
  switch (rule.type) {
    case "courses_completed_in_path":
      return completedInPath >= rule.min;
    case "path_complete":
      return progress.pathCourseIds.length > 0 && completedInPath === progress.pathCourseIds.length;
    case "manual_grant":
      return (progress.grantedLevels ?? []).includes(n);
  }
}

/** The learner's level: the highest level whose rule is satisfied, or null. */
export function computeLevel(
  levels: readonly LevelDefinition[],
  progress: PathProgress,
): LevelDefinition | null {
  let current: LevelDefinition | null = null;
  for (const level of levels) {
    if (isRuleSatisfied(level.rule, level.n, progress) && (!current || level.n > current.n)) {
      current = level;
    }
  }
  return current;
}

/** Returns the new level if progress moved the learner up, else null. */
export function detectLevelUp(
  levels: readonly LevelDefinition[],
  before: PathProgress,
  after: PathProgress,
): LevelDefinition | null {
  const previous = computeLevel(levels, before);
  const next = computeLevel(levels, after);
  if (next && (!previous || next.n > previous.n)) return next;
  return null;
}
