import { describe, expect, it } from "vitest";

import { canWatch, tracksViewer } from "@/core/media/access";

describe("who may watch", () => {
  const learner = { member: true, canEditCourses: false };
  const author = { member: true, canEditCourses: true };

  it("plays public videos for anyone and learner videos for the academy's members", () => {
    expect(canWatch("public", null)).toBe(true);
    expect(canWatch("learners", null)).toBe(false);
    expect(canWatch("learners", { member: false, canEditCourses: false })).toBe(false);
    expect(canWatch("learners", learner)).toBe(true);
    expect(canWatch("learners", author)).toBe(true);
  });

  it("tracks signed-in viewers only", () => {
    expect(tracksViewer(null)).toBe(false);
    expect(tracksViewer(learner)).toBe(true);
  });
});
