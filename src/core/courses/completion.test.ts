import { describe, expect, it } from "vitest";

import { academyEnding, missingParts, requiresTest, requiresWork } from "@/core/courses/completion";

describe("how a course is completed", () => {
  it("asks for the parts the authors chose, in either order", () => {
    expect(requiresWork("work") && !requiresTest("work")).toBe(true);
    expect(!requiresWork("test") && requiresTest("test")).toBe(true);
    expect(missingParts("work_and_test", { workPassed: false, testPassed: true })).toEqual([
      "work",
    ]);
    expect(missingParts("work_and_test", { workPassed: true, testPassed: false })).toEqual([
      "test",
    ]);
    expect(missingParts("work_and_test", { workPassed: true, testPassed: true })).toEqual([]);
    // A passed test does not stand in for the work, and the other way round.
    expect(missingParts("work", { workPassed: false, testPassed: true })).toEqual(["work"]);
    expect(missingParts("test", { workPassed: true, testPassed: false })).toEqual(["test"]);
  });

  it("waits for the sessions of a series like for the work and the test", () => {
    const done = { workPassed: true, testPassed: true };
    expect(missingParts("work", done, "none")).toEqual([]);
    expect(missingParts("work", done, "attended")).toEqual(["sessions"]);
    expect(missingParts("work", { ...done, sessionsPassed: false }, "attended_or_watched")).toEqual(
      ["sessions"],
    );
    expect(missingParts("work", { ...done, sessionsPassed: true }, "attended")).toEqual([]);
    expect(
      missingParts(
        "work_and_test",
        { workPassed: false, testPassed: true, sessionsPassed: false },
        "attended",
      ),
    ).toEqual(["work", "sessions"]);
    // Sessions alone never finish a course: the work or the test is always asked for.
    expect(
      missingParts(
        "test",
        { workPassed: true, testPassed: false, sessionsPassed: true },
        "attended",
      ),
    ).toEqual(["test"]);
  });
});

describe("what an academy promises on its home page", () => {
  it("promises real work only when every course asks for it", () => {
    expect(academyEnding([])).toBe("work");
    expect(academyEnding(["work", "work_and_test"])).toBe("work");
    expect(academyEnding(["test", "test"])).toBe("test");
    expect(academyEnding(["work", "test"])).toBe("mixed");
  });
});
