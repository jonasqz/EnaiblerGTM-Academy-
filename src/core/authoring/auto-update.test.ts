import { describe, expect, it } from "vitest";

import { changedSourceOf, recheckDue, sourceChangedReason } from "@/core/authoring/auto-update";

const now = new Date("2026-09-27T04:00:00Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60_000);

describe("auto-update from sources (brief §7)", () => {
  it("reads web pages again once a day", () => {
    expect(recheckDue({ kind: "url", status: "ready", checkedAt: null }, now)).toBe(true);
    expect(recheckDue({ kind: "url", status: "ready", checkedAt: hoursAgo(25) }, now)).toBe(true);
    expect(recheckDue({ kind: "url", status: "ready", checkedAt: hoursAgo(3) }, now)).toBe(false);
  });

  it("leaves sources alone that cannot change or are not read yet", () => {
    for (const kind of ["document", "recording", "interview"]) {
      expect(recheckDue({ kind, status: "ready", checkedAt: hoursAgo(48) }, now)).toBe(false);
    }
    expect(recheckDue({ kind: "url", status: "processing", checkedAt: null }, now)).toBe(false);
    expect(recheckDue({ kind: "url", status: "failed", checkedAt: hoursAgo(48) }, now)).toBe(false);
  });

  it("names the changed source in the lesson's flag", () => {
    const id = "0b7a1f6e-8a51-4d1c-9a55-3f0c2f7f9b10";
    expect(changedSourceOf(sourceChangedReason(id))).toBe(id);
    expect(changedSourceOf("something else")).toBeNull();
    expect(changedSourceOf(null)).toBeNull();
  });
});
