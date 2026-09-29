import { requiresSessions, type SessionRule } from "@/core/courses/sessions";

/**
 * How learners finish a course, chosen by its authors: real work reviewed
 * against the rubric (the brief's default), a final multiple-choice test, or
 * both. The Certificate of Completion is issued once every required part is
 * passed, in either order, and it says how it was earned. A series asks for
 * its live sessions too (core/courses/sessions).
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

export type CompletionPart = "work" | "test" | "sessions";

/** What still stands between the learner and the credential; empty when the course is done. */
export function missingParts(
  mode: CompletionMode,
  done: { workPassed: boolean; testPassed: boolean; sessionsPassed?: boolean },
  sessionRule: SessionRule = "none",
): CompletionPart[] {
  const missing: CompletionPart[] = [];
  if (requiresWork(mode) && !done.workPassed) missing.push("work");
  if (requiresTest(mode) && !done.testPassed) missing.push("test");
  if (requiresSessions(sessionRule) && !done.sessionsPassed) missing.push("sessions");
  return missing;
}

/**
 * What an academy can promise about all its courses (its home page): every
 * one ends with real work, every one with the test alone, or a mix. With no
 * courses yet it tells the brief's default story, real work.
 */
export function academyEnding(modes: readonly CompletionMode[]): "work" | "test" | "mixed" {
  if (modes.every(requiresWork)) return "work";
  if (modes.every((mode) => !requiresWork(mode))) return "test";
  return "mixed";
}
