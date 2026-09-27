import { describe, expect, it } from "vitest";

import { nextStep, nextStepHref, type CourseState } from "@/core/courses/next-step";

const fresh = { taken: false, passed: false };

function state(overrides: Partial<CourseState>): CourseState {
  return { mode: "work", resumeKey: null, work: null, test: fresh, ...overrides };
}

describe("the learner's next step", () => {
  it("continues with the lessons first", () => {
    expect(nextStep(state({ mode: "test", resumeKey: "basics" }))).toEqual({
      kind: "lesson",
      key: "basics",
    });
  });

  it("follows what the course asks for once the lessons are done", () => {
    expect(nextStep(state({ mode: "work" }))).toEqual({ kind: "work" });
    expect(nextStep(state({ mode: "work", work: "needs_revision" }))).toEqual({ kind: "work" });
    expect(nextStep(state({ mode: "work", work: "pending" }))).toEqual({ kind: "review" });
    expect(nextStep(state({ mode: "work", work: "passed" }))).toEqual({ kind: "done" });
    expect(nextStep(state({ mode: "test" }))).toEqual({ kind: "test", retake: false });
    expect(nextStep(state({ mode: "test", test: { taken: true, passed: false } }))).toEqual({
      kind: "test",
      retake: true,
    });
    expect(nextStep(state({ mode: "test", test: { taken: true, passed: true } }))).toEqual({
      kind: "done",
    });
  });

  it("does the work first when both parts are open, and the test while the work is in review", () => {
    expect(nextStep(state({ mode: "work_and_test" }))).toEqual({ kind: "work" });
    expect(nextStep(state({ mode: "work_and_test", work: "pending" }))).toEqual({
      kind: "test",
      retake: false,
    });
    expect(nextStep(state({ mode: "work_and_test", work: "passed" }))).toEqual({
      kind: "test",
      retake: false,
    });
    expect(
      nextStep(
        state({ mode: "work_and_test", work: "pending", test: { taken: true, passed: true } }),
      ),
    ).toEqual({ kind: "review" });
    expect(
      nextStep(
        state({ mode: "work_and_test", work: "passed", test: { taken: true, passed: true } }),
      ),
    ).toEqual({ kind: "done" });
  });

  it("ignores a part the course does not ask for", () => {
    // A test passed before the course switched to work only does not finish it, and the other way round.
    expect(nextStep(state({ mode: "work", test: { taken: true, passed: true } }))).toEqual({
      kind: "work",
    });
    expect(nextStep(state({ mode: "test", work: "pending" }))).toEqual({
      kind: "test",
      retake: false,
    });
  });

  it("links every step to its page", () => {
    expect(nextStepHref("pricing", { kind: "lesson", key: "anchors" })).toBe(
      "/courses/pricing/learn/anchors",
    );
    expect(nextStepHref("pricing", { kind: "work" })).toBe("/courses/pricing/assignment");
    expect(nextStepHref("pricing", { kind: "review" })).toBe("/courses/pricing/assignment");
    expect(nextStepHref("pricing", { kind: "test", retake: true })).toBe("/courses/pricing/test");
    expect(nextStepHref("pricing", { kind: "done" })).toBe("/courses/pricing");
  });
});
