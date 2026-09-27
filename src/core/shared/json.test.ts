import { describe, expect, it } from "vitest";

import { canonicalJson, sameJson } from "@/core/shared/json";

describe("canonicalJson", () => {
  it("ignores object key order at every depth", () => {
    expect(
      sameJson(
        { b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } },
        { a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 },
      ),
    ).toBe(true);
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("keeps array order and values significant", () => {
    expect(sameJson([1, 2], [2, 1])).toBe(false);
    expect(sameJson({ a: 1 }, { a: "1" })).toBe(false);
  });
});
