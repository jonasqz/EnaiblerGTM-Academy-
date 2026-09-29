import { describe, expect, it } from "vitest";

import { evidenceFor } from "@/core/credentials/evidence";

describe("what a credential rests on", () => {
  it("follows how the course ended", () => {
    expect(evidenceFor("work", [])).toEqual(["artifact"]);
    expect(evidenceFor("test", [])).toEqual(["quiz"]);
    expect(evidenceFor("work_and_test", [])).toEqual(["artifact", "quiz"]);
  });

  it("adds the sessions, live and caught up, in a fixed order", () => {
    expect(evidenceFor("work", ["relive", "attendance"])).toEqual([
      "artifact",
      "attendance",
      "relive",
    ]);
    expect(evidenceFor("test", ["attendance"])).toEqual(["quiz", "attendance"]);
  });
});
