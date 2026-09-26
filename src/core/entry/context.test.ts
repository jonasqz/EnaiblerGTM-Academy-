import { describe, expect, it } from "vitest";

import {
  decodeEntryContext,
  encodeEntryContext,
  entryDestination,
  entryEventProperties,
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
