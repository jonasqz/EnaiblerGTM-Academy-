import { describe, expect, it } from "vitest";

import {
  prefilledContentUrl,
  reportContentHref,
  reportReference,
  validateContentReport,
  type ContentReportInput,
} from "@/core/platform/report";

const valid: ContentReportInput = {
  url: " https://acme.academies.enaibler.app/verify/ABCD-EFGH-JKMN-PQRS ",
  reason: "illegal",
  explanation: "The showcase shows a photo I took, published without my permission.",
  name: " Jane Doe ",
  email: " Jane@Example.com ",
  goodFaith: true,
};

describe("content reports (DSA Art. 16)", () => {
  it("takes a complete report, trimmed", () => {
    expect(validateContentReport(valid)).toEqual({
      ok: true,
      report: {
        url: "https://acme.academies.enaibler.app/verify/ABCD-EFGH-JKMN-PQRS",
        reason: "illegal",
        explanation: "The showcase shows a photo I took, published without my permission.",
        name: "Jane Doe",
        email: "jane@example.com",
      },
    });
  });

  it("names every field that is missing or wrong, in form order", () => {
    expect(validateContentReport({})).toEqual({
      ok: false,
      fields: ["url", "reason", "explanation", "name", "email", "goodFaith"],
    });
    expect(
      validateContentReport({
        ...valid,
        url: "javascript:alert(1)",
        explanation: "Bad.",
        email: "jane",
        goodFaith: false,
      }),
    ).toEqual({ ok: false, fields: ["url", "explanation", "email", "goodFaith"] });
    expect(validateContentReport({ ...valid, reason: "spam" })).toEqual({
      ok: false,
      fields: ["reason"],
    });
    expect(
      validateContentReport({ ...valid, url: `https://a.example/${"x".repeat(2048)}` }),
    ).toEqual({ ok: false, fields: ["url"] });
  });

  it("asks for name and e-mail, except for child sexual abuse material", () => {
    const anonymous = { ...valid, name: "", email: "" };
    expect(validateContentReport(anonymous)).toEqual({ ok: false, fields: ["name", "email"] });
    const csam = validateContentReport({ ...anonymous, reason: "csam" });
    expect(csam.ok && csam.report).toMatchObject({ reason: "csam", name: null, email: null });
    // Given anyway, the e-mail address still has to be one.
    expect(validateContentReport({ ...anonymous, reason: "csam", email: "nope" })).toEqual({
      ok: false,
      fields: ["email"],
    });
  });

  it("requires the statement of good faith", () => {
    expect(validateContentReport({ ...valid, goodFaith: undefined })).toEqual({
      ok: false,
      fields: ["goodFaith"],
    });
  });

  it("fills the form only with a web address", () => {
    expect(prefilledContentUrl("https://acme.example/courses/x")).toBe(
      "https://acme.example/courses/x",
    );
    expect(prefilledContentUrl("javascript:alert(1)")).toBe("");
    expect(prefilledContentUrl(["https://a.example", "https://b.example"])).toBe("");
    expect(prefilledContentUrl(undefined)).toBe("");
  });

  it("gives a reference to quote, e.g. R-7K2Q-XM4B", () => {
    expect(reportReference()).toMatch(/^R-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(reportReference((bytes) => bytes.fill(0))).toBe("R-0000-0000");
  });
});

describe("the report link in an academy's footer", () => {
  const page = { origin: "https://academy.acme.example", pathname: "/courses/sales" };

  it("only exists with a platform host", () => {
    expect(reportContentHref(null, page)).toBeNull();
  });

  it("opens the website's form with the page's address", () => {
    const href = reportContentHref("https://enaibler.app", page);
    expect(href).toBe(
      "https://enaibler.app/report?url=https%3A%2F%2Facademy.acme.example%2Fcourses%2Fsales",
    );
    expect(new URL(href!).searchParams.get("url")).toBe(
      "https://academy.acme.example/courses/sales",
    );
  });

  it("never carries a query string or a token from the page", () => {
    const withQuery = reportContentHref("https://enaibler.app", {
      origin: page.origin,
      pathname: "/courses/sales?ctx=abc#top",
    });
    expect(new URL(withQuery!).searchParams.get("url")).toBe(
      "https://academy.acme.example/courses/sales",
    );
    for (const pathname of ["/sign-in/confirm", "/join/SECRET-CODE", "/consent/confirm"]) {
      const href = reportContentHref("http://localhost:3000", { origin: page.origin, pathname });
      expect(new URL(href!).searchParams.get("url")).toBe("https://academy.acme.example/");
    }
  });
});
