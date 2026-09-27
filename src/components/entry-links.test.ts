import { describe, expect, it } from "vitest";

import { continueUrl } from "@/components/entry-links";
import { decodeEntryContext } from "@/core/entry/context";

describe("the magic link's continue URL", () => {
  it("carries the entry context, where to go next and the news box", () => {
    expect(continueUrl({})).toBe("/auth/continue");
    expect(continueUrl({}, "/studio")).toBe("/auth/continue?next=%2Fstudio");
    expect(continueUrl({}, null, "de")).toBe("/auth/continue?news=de");

    const url = new URL(continueUrl({ course: "get-paid" }, "/me", "en"), "https://a.test");
    expect(decodeEntryContext(url.searchParams.get("ctx"))).toEqual({ course: "get-paid" });
    expect(url.searchParams.get("next")).toBe("/me");
    expect(url.searchParams.get("news")).toBe("en");
  });
});
