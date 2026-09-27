import { describe, expect, it } from "vitest";

import { can, capabilitiesOf, reviewsLimitedToCohorts } from "@/core/access/roles";

describe("roles", () => {
  it("keeps learners out of the Studio", () => {
    expect(capabilitiesOf(["learner"]).size).toBe(0);
  });

  it("lets only admins manage the academy and take contacts out of it", () => {
    for (const capability of ["academy.manage", "contacts.export"] as const) {
      expect(can(["tenant_admin"], capability)).toBe(true);
      expect(can(["author", "reviewer"], capability)).toBe(false);
    }
  });

  it("lets reviewers decide but not edit courses", () => {
    expect(can(["reviewer"], "reviews.decide")).toBe(true);
    expect(can(["reviewer"], "courses.edit")).toBe(false);
  });

  it("lets mentors review their cohorts, and nothing else", () => {
    expect(can(["mentor"], "reviews.decide")).toBe(true);
    expect(can(["mentor"], "courses.view")).toBe(false);
    expect(can(["mentor"], "people.view")).toBe(false);
    expect(reviewsLimitedToCohorts(["mentor", "learner"])).toBe(true);
    // A reviewer who also mentors a cohort keeps the full queue.
    expect(reviewsLimitedToCohorts(["mentor", "reviewer"])).toBe(false);
  });
});
