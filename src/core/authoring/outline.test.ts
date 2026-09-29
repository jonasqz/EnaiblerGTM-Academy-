import { describe, expect, it } from "vitest";

import {
  buildOutlinePrompt,
  chaptersOf,
  nearDuplicates,
  outlineByRules,
  outlineRecord,
  parseOutline,
} from "@/core/authoring/outline";
import { termOverlap } from "@/core/authoring/text";

const INTRO =
  "Welcome everyone to this webinar about getting paid on time, my name does not matter, let us start with the agenda for today";

const recordings = [
  {
    id: "w1",
    title: "Webinar 1",
    transcript: [
      { startSec: 0, endSec: 60, title: "Welcome", text: INTRO },
      {
        startSec: 60,
        endSec: 400,
        title: "The first reminder",
        text: "Send the first reminder three days after the due date, friendly and short.",
        keyframeFileId: "k1",
      },
    ],
  },
  {
    id: "w2",
    title: "Webinar 2",
    transcript: [
      { startSec: 0, endSec: 70, title: "Hello", text: `${INTRO}, thanks for joining again` },
      {
        startSec: 70,
        endSec: 500,
        title: "Late fees",
        text: "Business clients who pay late owe a flat fee of forty euros plus interest.",
      },
    ],
  },
];

describe("merging several recordings into one outline", () => {
  const chapters = chaptersOf(recordings);

  it("numbers the chapters of all recordings in order", () => {
    expect(chapters.map((chapter) => [chapter.ref, chapter.sourceId, chapter.title])).toEqual([
      ["T1", "w1", "Welcome"],
      ["T2", "w1", "The first reminder"],
      ["T3", "w2", "Hello"],
      ["T4", "w2", "Late fees"],
    ]);
    expect(chapters[1]?.keyframeFileId).toBe("k1");
  });

  it("drops a chapter another recording says nearly word for word, keeping the longer", () => {
    expect(termOverlap(INTRO, `${INTRO}, thanks for joining again`)).toBeGreaterThan(0.6);
    expect(termOverlap(chapters[1]!.text, chapters[3]!.text)).toBeLessThan(0.2);
    expect(nearDuplicates(chapters)).toEqual(new Map([["T1", "T3"]]));
    // Within one recording a speaker may repeat a point: never compared.
    const repeated = chaptersOf([
      {
        id: "w1",
        title: "W",
        transcript: [recordings[0]!.transcript[0]!, recordings[0]!.transcript[0]!],
      },
    ]);
    expect(nearDuplicates(repeated).size).toBe(0);
  });

  it("orders by the recordings without the model", () => {
    const outline = outlineByRules(chapters, new Map([["T1", "T3"]]));
    expect(outline).toEqual({
      topics: [
        { title: "The first reminder", refs: ["T2"] },
        { title: "Hello", refs: ["T3"] },
        { title: "Late fees", refs: ["T4"] },
      ],
      duplicates: [{ ref: "T1", sameAs: "T3" }],
      by: "rules",
    });
  });

  it("asks the model for topics in teaching order, chapters as data", () => {
    const prompt = buildOutlinePrompt({
      chapters: chapters.slice(1),
      criteria: [{ label: "Timing" }],
      nonce: "n",
    });
    expect(prompt.system).toContain("Use every chapter ref exactly once");
    expect(prompt.user).toContain("## T2 · Webinar 1 · The first reminder (1:00–6:40)");
    expect(prompt.user).toContain("- Timing");
  });

  it("takes the model's outline, adds what it left out and refuses refs used twice", () => {
    const shown = chapters.filter((chapter) => chapter.ref !== "T1");
    const rule = new Map([["T1", "T3"]]);
    const outline = parseOutline(
      JSON.stringify({
        topics: [
          { title: "Late fees", chapter_refs: ["T4"] },
          { title: "Reminders", chapter_refs: ["T2"] },
        ],
        duplicates: [],
      }),
      shown,
      rule,
    );
    expect(outline).toEqual({
      topics: [
        { title: "Late fees", refs: ["T4"] },
        { title: "Reminders", refs: ["T2"] },
        // Left out by the model, never lost.
        { title: "Hello", refs: ["T3"] },
      ],
      duplicates: [{ ref: "T1", sameAs: "T3" }],
      by: "ai",
    });
    expect(
      parseOutline(
        JSON.stringify({
          topics: [{ title: "All", chapter_refs: ["T2", "T4"] }],
          duplicates: [{ ref: "T3", same_as: "T2" }],
        }),
        shown,
        rule,
      )?.duplicates,
    ).toEqual([
      { ref: "T1", sameAs: "T3" },
      { ref: "T3", sameAs: "T2" },
    ]);
    const twice = JSON.stringify({
      topics: [
        { title: "A", chapter_refs: ["T2"] },
        { title: "B", chapter_refs: ["T2"] },
      ],
      duplicates: [],
    });
    expect(parseOutline(twice, shown, rule)).toBeNull();
    const unknown = JSON.stringify({
      topics: [{ title: "A", chapter_refs: ["T9"] }],
      duplicates: [],
    });
    expect(parseOutline(unknown, shown, rule)).toBeNull();
    const dangling = JSON.stringify({
      topics: [{ title: "A", chapter_refs: ["T2"] }],
      duplicates: [{ ref: "T4", same_as: "T3" }],
    });
    expect(parseOutline(dangling, shown, rule)).toBeNull();
  });

  it("keeps labels, not refs, for the author", () => {
    const record = outlineRecord(outlineByRules(chapters, new Map([["T1", "T3"]])), chapters);
    expect(record).toEqual({
      by: "rules",
      recordings: 2,
      topics: [
        { title: "The first reminder", chapters: ["Webinar 1 · The first reminder (1:00–6:40)"] },
        { title: "Hello", chapters: ["Webinar 2 · Hello (0:00–1:10)"] },
        { title: "Late fees", chapters: ["Webinar 2 · Late fees (1:10–8:20)"] },
      ],
      duplicates: [
        { chapter: "Webinar 1 · Welcome (0:00–1:00)", sameAs: "Webinar 2 · Hello (0:00–1:10)" },
      ],
    });
  });
});
