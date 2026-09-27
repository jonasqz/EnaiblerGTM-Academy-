/**
 * How learners finish a course, chosen by its authors: real work reviewed
 * against the rubric (the brief's default), a final multiple-choice test, or
 * both. The Certificate of Completion is issued once every required part is
 * passed, in either order, and it says how it was earned.
 */
export const COMPLETION_MODES = ["work", "test", "work_and_test"] as const;
export type CompletionMode = (typeof COMPLETION_MODES)[number];

export function isCompletionMode(value: unknown): value is CompletionMode {
  return typeof value === "string" && (COMPLETION_MODES as readonly string[]).includes(value);
}

export function requiresWork(mode: CompletionMode): boolean {
  return mode !== "test";
}

export function requiresTest(mode: CompletionMode): boolean {
  return mode !== "work";
}

export type CompletionPart = "work" | "test";

/** What still stands between the learner and the credential; empty when the course is done. */
export function missingParts(
  mode: CompletionMode,
  done: { workPassed: boolean; testPassed: boolean },
): CompletionPart[] {
  const missing: CompletionPart[] = [];
  if (requiresWork(mode) && !done.workPassed) missing.push("work");
  if (requiresTest(mode) && !done.testPassed) missing.push("test");
  return missing;
}
