import { describe, expect, it } from "vitest";

import {
  captionCues,
  cueAt,
  parseWebVtt,
  searchCues,
  toWebVtt,
  vttTime,
} from "@/core/media/captions";

describe("captions", () => {
  it("writes WebVTT times", () => {
    expect(vttTime(0)).toBe("00:00:00.000");
    expect(vttTime(3725.5)).toBe("01:02:05.500");
    expect(vttTime(59.9996)).toBe("00:01:00.000");
  });

  it("cuts long segments into short cues that share the segment's time", () => {
    const long = {
      start: 10,
      end: 40,
      text: "Welcome to the webinar. Today we look at pricing pages, what makes them convert, and how to test a new one without losing the customers you already have.",
    };
    const cues = captionCues([long]);
    expect(cues.length).toBeGreaterThanOrEqual(5);
    expect(cues[0]!.start).toBe(10);
    expect(cues.at(-1)!.end).toBeCloseTo(40, 1);
    for (const cue of cues) {
      expect(cue.text.length).toBeLessThanOrEqual(84);
      expect(cue.end - cue.start).toBeLessThanOrEqual(7.5);
    }
    // Nothing lost, nothing added.
    expect(cues.map((cue) => cue.text).join(" ")).toBe(long.text);
  });

  it("keeps short segments, in order and without overlap", () => {
    const cues = captionCues([
      { start: 5, end: 9, text: "  Second  " },
      { start: 0, end: 6, text: "First" },
      { start: 9, end: 9, text: "empty span" },
    ]);
    expect(cues).toEqual([
      { start: 0, end: 5, text: "First" },
      { start: 5, end: 9, text: "Second" },
    ]);
  });

  it("escapes markup and never lets text end a cue early", () => {
    const vtt = toWebVtt([
      { start: 0, end: 2, text: "a < b & c --> d" },
      { start: 2, end: 4, text: "line\n\nbreak" },
    ]);
    expect(vtt).toBe(
      "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\na &lt; b &amp; c → d\n\n00:00:02.000 --> 00:00:04.000\nline break\n",
    );
  });

  it("reads its own files back, and ordinary WebVTT", () => {
    const cues = [
      { start: 0, end: 2.5, text: "Tom & Jerry <3" },
      { start: 2.5, end: 4, text: "Zweiter Satz" },
    ];
    expect(parseWebVtt(toWebVtt(cues))).toEqual(cues);
    expect(
      parseWebVtt(
        "WEBVTT - title\r\n\r\nNOTE a comment\r\n\r\nintro\r\n01:02.000 --> 01:04.500 align:start\r\n<v Host>Hello</v>\r\nthere\r\n",
      ),
    ).toEqual([{ start: 62, end: 64.5, text: "Hello there" }]);
  });

  it("finds cues by every word, ignoring case and accents", () => {
    const cues = [
      { start: 0, end: 2, text: "Über die Preisseite" },
      { start: 2, end: 4, text: "Pricing pages that convert" },
      { start: 4, end: 6, text: "pricing experiments" },
    ];
    expect(searchCues(cues, "uber")).toEqual([0]);
    expect(searchCues(cues, "PRICING convert")).toEqual([1]);
    expect(searchCues(cues, "  ")).toEqual([0, 1, 2]);
    expect(searchCues(cues, "nothing")).toEqual([]);
  });

  it("knows which cue is on screen", () => {
    const cues = [
      { start: 0, end: 2, text: "a" },
      { start: 3, end: 5, text: "b" },
    ];
    expect(cueAt(cues, 0)).toBe(0);
    expect(cueAt(cues, 2.5)).toBe(-1);
    expect(cueAt(cues, 4.99)).toBe(1);
    expect(cueAt(cues, 5)).toBe(-1);
    expect(cueAt([], 1)).toBe(-1);
  });
});
