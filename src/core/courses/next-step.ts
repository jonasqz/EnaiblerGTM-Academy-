import { requiresTest, requiresWork, type CompletionMode } from "@/core/courses/completion";
import type { Outcome } from "@/core/review/outcome";

/**
 * Where a learner goes next in a course: the next lesson, then whatever the
 * course still asks for (core/courses/completion). Work comes before the test
 * when both are open, but while the work is in review a course with a test
 * sends them to the test, so nobody waits with nothing to do.
 */
export type NextStep =
  | { kind: "lesson"; key: string }
  | { kind: "work" }
  | { kind: "test"; retake: boolean }
  | { kind: "review" }
  | { kind: "done" };

export interface CourseState {
  mode: CompletionMode;
  /** The first unfinished lesson; null once every lesson is done. */
  resumeKey: string | null;
  /** Outcome of the latest hand-in; null before the first. */
  work: Outcome | null;
  test: { taken: boolean; passed: boolean };
}

export function nextStep(state: CourseState): NextStep {
  if (state.resumeKey) return { kind: "lesson", key: state.resumeKey };
  const workOpen = requiresWork(state.mode) && state.work !== "passed";
  if (workOpen && state.work !== "pending") return { kind: "work" };
  if (requiresTest(state.mode) && !state.test.passed) {
    return { kind: "test", retake: state.test.taken };
  }
  return workOpen ? { kind: "review" } : { kind: "done" };
}

/** The page for a step; `done` leads back to the course. */
export function nextStepHref(slug: string, step: NextStep): string {
  switch (step.kind) {
    case "lesson":
      return `/courses/${slug}/learn/${step.key}`;
    case "work":
    case "review":
      return `/courses/${slug}/assignment`;
    case "test":
      return `/courses/${slug}/test`;
    case "done":
      return `/courses/${slug}`;
  }
}
