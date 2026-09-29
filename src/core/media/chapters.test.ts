import { describe, expect, it } from "vitest";

import { chapterAt, normalizeChapters, renameChapters } from "@/core/media/chapters";

describe("chapters", () => {
  it("orders topics, starts the first at 0 and drops ones on top of each other or past the end", () => {
    expect(
      normalizeChapters(
        [
          { startSec: 125.04, title: "  Pricing   pages " },
          { startSec: 3.2, title: "Welcome" },
          { startSec: 127, title: "Duplicate" },
          { startSec: 900, title: "After the end" },
          { startSec: Number.NaN, title: "Broken" },
        ],
        600,
      ),
    ).toEqual([
      { startSec: 0, title: "Welcome" },
      { startSec: 125, title: "Pricing pages" },
    ]);
  });

  it("keeps topics without a title for the author to name, but not a lone chapter", () => {
    expect(normalizeChapters([{ startSec: 0 }, { startSec: 90, title: null }])).toEqual([
      { startSec: 0, title: "" },
      { startSec: 90, title: "" },
    ]);
    expect(normalizeChapters([{ startSec: 0, title: "Everything" }])).toEqual([]);
  });

  it("knows which chapter is playing", () => {
    const chapters = [
      { startSec: 0, title: "a" },
      { startSec: 60, title: "b" },
      { startSec: 120, title: "c" },
    ];
    expect(chapterAt(chapters, 0)).toBe(0);
    expect(chapterAt(chapters, 59.9)).toBe(0);
    expect(chapterAt(chapters, 60)).toBe(1);
    expect(chapterAt(chapters, 5000)).toBe(2);
    expect(chapterAt([], 5)).toBe(-1);
  });

  it("renames chapters without moving them", () => {
    const chapters = [
      { startSec: 0, title: "" },
      { startSec: 60, title: "Old" },
    ];
    expect(renameChapters(chapters, [" Intro ", "New"])).toEqual([
      { startSec: 0, title: "Intro" },
      { startSec: 60, title: "New" },
    ]);
    expect(renameChapters(chapters, ["Only one"])).toBeNull();
  });
});
