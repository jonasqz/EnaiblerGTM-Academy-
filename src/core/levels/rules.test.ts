import { describe, expect, it } from "vitest";

import {
  computeLevel,
  detectLevelUp,
  formatLevelRule,
  levelSchemeSchema,
  parseLevelRule,
  type LevelDefinition,
} from "@/core/levels/rules";

const tenant0Levels: LevelDefinition[] = levelSchemeSchema.parse([
  { n: 1, name: "Apprentice", rule: "courses_completed_in_path >= 1" },
  { n: 2, name: "Practitioner", rule: "courses_completed_in_path >= 2" },
  { n: 3, name: "Pro", rule: "path_complete" },
  { n: 4, name: "Mentor", rule: "manual_grant" },
]);

const path = ["validation-lab", "market-sizing", "pricing", "go-to-market"];

describe("level rules", () => {
  it("parses the short rule syntax from the brief", () => {
    expect(parseLevelRule("courses_completed_in_path >= 2")).toEqual({
      type: "courses_completed_in_path",
      min: 2,
    });
    expect(parseLevelRule("courses_completed_in_path>=1")).toEqual({
      type: "courses_completed_in_path",
      min: 1,
    });
    expect(parseLevelRule("path_complete")).toEqual({ type: "path_complete" });
    expect(parseLevelRule("manual_grant")).toEqual({ type: "manual_grant" });
    expect(parseLevelRule("courses_completed_in_path >= 0")).toBeNull();
    expect(parseLevelRule("courses_completed >= 2")).toBeNull();
  });

  it("round-trips rules through the short syntax", () => {
    for (const level of tenant0Levels) {
      expect(parseLevelRule(formatLevelRule(level.rule))).toEqual(level.rule);
    }
  });

  it("requires levels numbered 1..N", () => {
    expect(
      levelSchemeSchema.safeParse([{ n: 2, name: "Two", rule: "path_complete" }]).success,
    ).toBe(false);
    expect(
      levelSchemeSchema.safeParse([
        { n: 1, name: "One", rule: "path_complete" },
        { n: 1, name: "Uno", rule: "manual_grant" },
      ]).success,
    ).toBe(false);
  });

  it("sorts levels by number", () => {
    const levels = levelSchemeSchema.parse([
      { n: 2, name: "Two", rule: "path_complete" },
      { n: 1, name: "One", rule: "courses_completed_in_path >= 1" },
    ]);
    expect(levels.map((level) => level.n)).toEqual([1, 2]);
  });
});

describe("computeLevel (tenant 0 scheme)", () => {
  it("has no level before the first course", () => {
    expect(computeLevel(tenant0Levels, { pathCourseIds: path, completedCourseIds: [] })).toBeNull();
  });

  it("counts only courses inside the chosen path", () => {
    const level = computeLevel(tenant0Levels, {
      pathCourseIds: path,
      completedCourseIds: ["validation-lab", "some-other-course"],
    });
    expect(level?.n).toBe(1);
  });

  it("reaches Pro when the whole path is complete", () => {
    expect(computeLevel(tenant0Levels, { pathCourseIds: path, completedCourseIds: path })?.n).toBe(
      3,
    );
  });

  it("never treats an empty path as complete", () => {
    expect(
      computeLevel(tenant0Levels, { pathCourseIds: [], completedCourseIds: ["x"] }),
    ).toBeNull();
  });

  it("grants Mentor only manually", () => {
    const progress = { pathCourseIds: path, completedCourseIds: path, grantedLevels: [4] };
    expect(computeLevel(tenant0Levels, progress)?.n).toBe(4);
  });

  it("detects level-ups", () => {
    const before = { pathCourseIds: path, completedCourseIds: ["validation-lab"] };
    const after = { pathCourseIds: path, completedCourseIds: ["validation-lab", "pricing"] };
    expect(detectLevelUp(tenant0Levels, before, after)?.n).toBe(2);
    expect(detectLevelUp(tenant0Levels, after, after)).toBeNull();
  });
});
