import { describe, expect, it } from "vitest";

import {
  sectionLabel,
  sectionsWithinBudget,
  sourceSections,
  type SourceSection,
} from "@/core/authoring/sections";

describe("sources as sections", () => {
  it("takes a recording's chapters with their time spans", () => {
    const sections = sourceSections({
      id: "rec",
      title: "Webinar: Pricing",
      kind: "recording",
      transcript: [
        { startSec: 0, endSec: 95, title: "Why price matters", text: "Price is a signal." },
        { startSec: 95, endSec: 750.4, text: "Anchor high." },
      ],
    });
    expect(sections).toEqual([
      {
        sourceId: "rec",
        sourceTitle: "Webinar: Pricing",
        index: 1,
        title: "Why price matters",
        startSec: 0,
        endSec: 95,
        text: "Price is a signal.",
      },
      {
        sourceId: "rec",
        sourceTitle: "Webinar: Pricing",
        index: 2,
        title: null,
        startSec: 95,
        endSec: 750.4,
        text: "Anchor high.",
      },
    ]);
    expect(sections.map(sectionLabel)).toEqual([
      "Webinar: Pricing · Why price matters (0:00–1:35)",
      "Webinar: Pricing · 1:35–12:30",
    ]);
  });

  it("splits a text at its headings and numbers the parts without one", () => {
    const sections = sourceSections({
      id: "doc",
      title: "Playbook",
      kind: "document",
      content: "Intro text.\n\n## Late fees\n\nCharge 40 euros.\n\n### Interest\n\nNine points.",
    });
    expect(sections.map((section) => [section.title, section.text])).toEqual([
      [null, "Intro text."],
      ["Late fees", "Charge 40 euros."],
      ["Interest", "Nine points."],
    ]);
    expect(sections.map(sectionLabel)).toEqual([
      "Playbook · #1",
      "Playbook · Late fees",
      "Playbook · Interest",
    ]);
    expect(sourceSections({ id: "x", title: "Empty", kind: "url", content: "  " })).toEqual([]);
  });

  it("cuts long parts so every section fits a prompt", () => {
    const long = Array.from({ length: 60 }, (_, index) => `Sentence number ${index} is here.`).join(
      " ",
    );
    const sections = sourceSections({ id: "doc", title: "Long", kind: "document", content: long });
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.every((section) => section.text.length <= 2_500)).toBe(true);
  });

  it("shares the budget between sources, in order", () => {
    const section = (sourceId: string, index: number, size: number): SourceSection => ({
      sourceId,
      sourceTitle: sourceId,
      index,
      title: null,
      text: "x".repeat(size),
    });
    const all = [
      section("long", 1, 100),
      section("long", 2, 100),
      section("long", 3, 100),
      section("short", 1, 100),
    ];
    const picked = sectionsWithinBudget(all, { total: 300, each: 100 });
    expect(picked.map((entry) => `${entry.sourceId}${entry.index}`)).toEqual([
      "long1",
      "long2",
      "short1",
    ]);
    expect(
      sectionsWithinBudget([section("a", 1, 500)], { total: 1_000, each: 120 })[0]!.text,
    ).toHaveLength(120);
  });
});
