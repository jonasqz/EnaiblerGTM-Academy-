import { describe, expect, it } from "vitest";

import { academySlugIssue, suggestAcademySlug } from "@/core/platform/academy-slug";

describe("academy slugs", () => {
  it("accepts short DNS-safe names", () => {
    expect(academySlugIssue("acme-sales")).toBeNull();
    expect(academySlugIssue("a1b")).toBeNull();
  });

  it("rejects what cannot be a clean subdomain", () => {
    for (const slug of [
      "ab",
      "-acme",
      "acme-",
      "ac--me",
      "Acme",
      "acme_sales",
      "a".repeat(41),
      "acme.sales",
    ]) {
      expect(academySlugIssue(slug)).toBe("invalid");
    }
  });

  it("reserves platform names", () => {
    for (const slug of ["www", "api", "studio", "enaibler", "admin", "platform"]) {
      expect(academySlugIssue(slug)).toBe("reserved");
    }
  });

  it("suggests a slug from the academy name, cut at a word", () => {
    expect(suggestAcademySlug("Acme Sales Academy")).toBe("acme-sales-academy");
    expect(suggestAcademySlug("Grüße & Größen Akademie")).toBe("gruesse-groessen-akademie");
    const long = suggestAcademySlug(
      "The Very Long Name Of An Academy For Product Managers In Europe",
    );
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith("-")).toBe(false);
    expect(academySlugIssue(long)).toBeNull();
  });
});
