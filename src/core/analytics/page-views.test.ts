import { describe, expect, it } from "vitest";

import { pageAnalyticsConfig, pageViewPath } from "@/core/analytics/page-views";

describe("page views (brief §10, cookieless)", () => {
  it("is off unless configured completely", () => {
    expect(pageAnalyticsConfig({})).toBeNull();
    expect(
      pageAnalyticsConfig({ provider: "umami", scriptUrl: "https://stats.example.com/script.js" }),
    ).toBeNull();
    expect(
      pageAnalyticsConfig({
        provider: "Umami",
        scriptUrl: "https://stats.example.com/script.js",
        websiteId: "8f1c",
      }),
    ).toEqual({
      provider: "umami",
      scriptUrl: "https://stats.example.com/script.js",
      websiteId: "8f1c",
    });
    expect(
      pageAnalyticsConfig({
        provider: "plausible",
        scriptUrl: "https://plausible.example.com/js/script.manual.js",
      }),
    ).toEqual({
      provider: "plausible",
      scriptUrl: "https://plausible.example.com/js/script.manual.js",
    });
    expect(
      pageAnalyticsConfig({ provider: "matomo", scriptUrl: "https://x.example.com/m.js" }),
    ).toBeNull();
  });

  it("reports paths without query strings", () => {
    expect(pageViewPath("/courses/validation-lab")).toBe("/courses/validation-lab");
    expect(pageViewPath("/paths/validator?ctx=abc")).toBe("/paths/validator");
  });

  it("leaves out pages whose address carries a token, the Studio and the embed", () => {
    for (const path of [
      "/sign-in/confirm",
      "/consent/confirm",
      "/auth/continue",
      "/join/a1b2c3d4e5f6",
      "/studio",
      "/studio/courses",
      "/embed/paths",
    ]) {
      expect(pageViewPath(path)).toBeNull();
    }
    expect(pageViewPath("/studios-of-the-world")).toBe("/studios-of-the-world");
  });
});
