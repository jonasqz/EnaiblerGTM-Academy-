import { describe, expect, it } from "vitest";

import {
  decodeEntryContext,
  embedEntryContext,
  encodeEntryContext,
  entryDestination,
  entryEventProperties,
  entryQuery,
  isEmptyEntryContext,
  parseEntryParams,
} from "@/core/entry/context";

const tenant = { tenantLocales: ["de", "en"] as const };

function parse(query: string, locales: readonly ("de" | "en")[] = tenant.tenantLocales) {
  return parseEntryParams(new URLSearchParams(query), { tenantLocales: locales });
}

describe("entry context", () => {
  it("parses the documented deep link", () => {
    expect(
      parse(
        "path=validator&course=validation-lab&lang=EN&utm_source=newsletter&utm_campaign=launch-2027",
      ),
    ).toEqual({
      path: "validator",
      course: "validation-lab",
      lang: "en",
      utm: { source: "newsletter", campaign: "launch-2027" },
    });
  });

  it("treats every parameter as optional", () => {
    const context = parse("");
    expect(context).toEqual({});
    expect(isEmptyEntryContext(context)).toBe(true);
  });

  it("drops invalid values instead of failing", () => {
    expect(parse("course=../../etc/passwd&path=<script>&lang=fr&utm_source=%00x")).toEqual({});
    expect(parse("utm_medium=" + "x".repeat(500))).toEqual({});
  });

  it("drops languages the tenant does not offer", () => {
    expect(parse("lang=en", ["de"])).toEqual({});
  });

  it("survives encoding for cookies and callback URLs", () => {
    const context = parse("course=validation-lab&utm_source=linkedin");
    const encoded = encodeEntryContext(context);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeEntryContext(encoded)).toEqual(context);
  });

  it("rejects tampered or foreign payloads", () => {
    expect(decodeEntryContext("not-base64-json")).toBeNull();
    expect(
      decodeEntryContext(Buffer.from(JSON.stringify({ course: "../x" })).toString("base64url")),
    ).toBeNull();
    expect(
      decodeEntryContext(Buffer.from(JSON.stringify({ admin: true })).toString("base64url")),
    ).toBeNull();
    expect(decodeEntryContext(null)).toBeNull();
  });

  it("routes to the course, then the path, then home", () => {
    expect(entryDestination({ course: "validation-lab", path: "validator" })).toBe(
      "/courses/validation-lab",
    );
    expect(entryDestination({ path: "validator" })).toBe("/paths/validator");
    expect(entryDestination({})).toBe("/");
  });

  it("flattens into event properties", () => {
    expect(entryEventProperties({ course: "c1", utm: { source: "s", medium: "m" } })).toEqual({
      entry_course: "c1",
      utm_source: "s",
      utm_medium: "m",
    });
  });
});

describe("safeNextPath", () => {
  it("allows known sections of the academy", async () => {
    const { safeNextPath } = await import("@/core/entry/context");
    expect(safeNextPath("/studio")).toBe("/studio");
    expect(safeNextPath("/studio/courses/abc?tab=lessons")).toBe("/studio/courses/abc?tab=lessons");
    expect(safeNextPath("/me")).toBe("/me");
    expect(safeNextPath("/courses/validation-lab/learn/intro")).toBe(
      "/courses/validation-lab/learn/intro",
    );
    // A webinar form's magic link comes back to confirm the seat.
    expect(safeNextPath("/webinars/pricing-live/confirm?token=abc_DEF-123")).toBe(
      "/webinars/pricing-live/confirm?token=abc_DEF-123",
    );
  });

  it("drops everything else", async () => {
    const { safeNextPath } = await import("@/core/entry/context");
    for (const value of [
      null,
      "",
      "https://evil.example/studio",
      "//evil.example/studio",
      "/\\evil.example",
      "/api/auth/sign-out",
      "/studio/../api",
      '/me"><script>',
      "/studiox",
    ]) {
      expect(safeNextPath(value), String(value)).toBeNull();
    }
  });
});

describe("embedded path picker", () => {
  const embed = (query: string) => embedEntryContext(new URLSearchParams(query), tenant);

  it("counts visits as coming from the embed unless the embed code says otherwise", () => {
    expect(embed("")).toEqual({ utm: { medium: "embed", content: "path-picker" } });
    expect(embed("lang=de&utm_source=website&utm_medium=sidebar")).toEqual({
      lang: "de",
      utm: { medium: "sidebar", content: "path-picker", source: "website" },
    });
  });

  it("leaves the path and course to the learner's click", () => {
    expect(embed("path=validator&course=validation-lab")).not.toHaveProperty("path");
    expect(embed("path=validator&course=validation-lab")).not.toHaveProperty("course");
  });

  it("links back into the deep-link format", () => {
    const context = { ...embed("lang=en&utm_source=website"), path: "validator" };
    const query = entryQuery(context);
    expect(query).toBe(
      "path=validator&lang=en&utm_source=website&utm_medium=embed&utm_content=path-picker",
    );
    expect(parse(query)).toEqual(context);
  });
});
