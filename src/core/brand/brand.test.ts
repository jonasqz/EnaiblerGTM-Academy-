import { describe, expect, it } from "vitest";

import { proposeTheme } from "@/core/brand/propose";
import {
  extractSignals,
  inlineCss,
  metaThemeColor,
  parseColor,
  primaryFamily,
  stylesheetUrls,
} from "@/core/brand/signals";
import { themeContrastIssues } from "@/core/theme/contrast";
import { themeSchema } from "@/core/theme/schema";

const SAAS_CSS = `
:root { --brand-primary: #ff5a1f; --brand-accent: rgb(20 120 220); --gray-100: #f3f4f6; }
body { background: #ffffff; color: #1a1a2e; font-family: "Proxima Nova", Arial, sans-serif; }
h1, h2 { font-family: 'Playfair Display', Georgia, serif; }
.card { border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,.1); border: 1px solid var(--gray-100); }
.btn-primary { background: var(--brand-primary); color: #fff; border-radius: 8px; }
.icon { font-family: "Font Awesome 6 Free"; }
a { color: var(--brand-accent); }
`;

const BRUTALIST_CSS = `
body { background-color: #fff4e0; color: #111; font: 400 16px/1.5 "Space Grotesk", sans-serif; }
.button { background: #ff6b4a; border: 3px solid #111; box-shadow: 4px 4px 0 #111; border-radius: 0; }
.card { border: 3px solid #111; box-shadow: 6px 6px 0 #111; border-radius: 0; }
.tag { border: 3px solid #111; box-shadow: 2px 2px 0 #111; background: #ffd23f; }
`;

describe("brand signals", () => {
  it("parses the colour syntaxes sites use", () => {
    expect(parseColor("#fff")).toBe("#ffffff");
    expect(parseColor("#FF5A1F")).toBe("#ff5a1f");
    expect(parseColor("rgb(59 130 246 / var(--tw-bg-opacity))")).toBe("#3b82f6");
    expect(parseColor("rgba(0, 0, 0, .1)")).toBeNull();
    expect(parseColor("hsl(0 100% 50%)")).toBe("#ff0000");
    expect(parseColor("transparent")).toBeNull();
  });

  it("finds stylesheets, inline CSS and the theme colour", () => {
    const html = `<head>
      <link rel="preload" href="/font.woff2"><link rel="stylesheet" href="/css/site.css?v=2">
      <link href="https://cdn.example.com/a.css" rel="stylesheet"><link rel=stylesheet href=/css/site.css?v=2>
      <meta name="theme-color" content="#0f7b6c"><style>.x{color:#123456}</style></head>
      <body><div style="background:#abcdef">x</div></body>`;
    expect(stylesheetUrls(html, "https://acme.example/about")).toEqual([
      "https://acme.example/css/site.css?v=2",
      "https://cdn.example.com/a.css",
    ]);
    expect(metaThemeColor(html)).toBe("#0f7b6c");
    expect(inlineCss(html)).toContain(".x{color:#123456}");
    expect(inlineCss(html)).toContain("background:#abcdef");
  });

  it("skips icon fonts and generic families", () => {
    expect(primaryFamily('"Font Awesome 6 Free", sans-serif')).toBeNull();
    expect(primaryFamily("-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto")).toBe("Segoe UI");
  });

  it("resolves brand variables used by buttons", () => {
    const signals = extractSignals(SAAS_CSS);
    const brand = signals.colors.find((color) => color.hex === "#ff5a1f");
    expect(brand?.roles).toEqual(expect.arrayContaining(["variable", "button"]));
    expect(brand?.variables).toContain("--brand-primary");
    expect(signals.fonts.map((font) => font.family)).toEqual(["Proxima Nova", "Playfair Display"]);
    expect(signals.radii).toEqual([8, 8]);
    expect(signals.shadows).toEqual({ hard: 0, soft: 1 });
  });
});

describe("theme proposal", () => {
  it("turns a typical site into a readable soft theme", () => {
    const { theme, notes } = proposeTheme(extractSignals(SAAS_CSS));
    expect(theme.colors.primary).toBe("#ff5a1f");
    expect(theme.colors.accents).toContain("#1478dc");
    expect(theme.colors.ink).toBe("#1a1a2e");
    expect(theme.fonts).toEqual({ display: "Playfair Display", body: "Montserrat" });
    expect(theme).toMatchObject({ radius: "8px", border_width: "1px", visual_style: "soft" });
    expect(notes).toContainEqual({ code: "font", site: "Proxima Nova", font: "Montserrat" });
    expect(
      themeContrastIssues(themeSchema.parse(theme)).filter((issue) => issue.severity === "error"),
    ).toEqual([]);
  });

  it("recognises an outlined, hard-shadow style", () => {
    const { theme } = proposeTheme(extractSignals(BRUTALIST_CSS));
    expect(theme).toMatchObject({
      radius: "0px",
      border_width: "2px",
      visual_style: "outlined",
      shadow: { blur: "0px" },
      fonts: { display: "Space Grotesk", body: "Space Grotesk" },
    });
    expect(theme.colors.surface).toBe("#fff4e0");
  });

  it("stays readable and sensible without any signals", () => {
    const { theme, notes } = proposeTheme(extractSignals(""));
    expect(theme.colors.primary).toBe("#3b5bdb");
    expect(notes[0]).toEqual({ code: "no_brand_color" });
    expect(themeContrastIssues(themeSchema.parse(theme))).toEqual([]);
  });
});
