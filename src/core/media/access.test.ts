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

  it("plays a webinar's recording for its registrants, signed in, and its authors", () => {
    expect(canWatch("registrants", null)).toBe(false);
    expect(canWatch("registrants", learner)).toBe(false);
    expect(canWatch("registrants", { ...learner, signedUp: false })).toBe(false);
    expect(canWatch("registrants", { ...learner, signedUp: true })).toBe(true);
    // Signed up somewhere but no member of this academy (another academy's session).
    expect(canWatch("registrants", { member: false, canEditCourses: false, signedUp: true })).toBe(
      false,
    );
    expect(canWatch("registrants", author)).toBe(true);
  });

  it("tracks signed-in viewers only", () => {
    expect(tracksViewer(null)).toBe(false);
    expect(tracksViewer(learner)).toBe(true);
  });
});
