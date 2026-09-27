import { describe, expect, it } from "vitest";

import { contrastRatio, mostReadable } from "@/core/theme/color";
import { themeContrastIssues } from "@/core/theme/contrast";
import { fontFaceCss, pathColor, themeToCssVariables } from "@/core/theme/css";
import { DEFAULT_THEME, enaiblerTokens } from "@/core/theme/enaibler-tokens";
import { closestBundledFont, guessFontFace } from "@/core/theme/fonts";
import { themeSchema, type ThemeInput } from "@/core/theme/schema";

const tenant0: ThemeInput = {
  colors: {
    ink: "#2E2A36",
    surface: "#F3EBDD",
    card: "#FBF6EC",
    primary: "#DD7F6C",
    accents: ["#E6C878", "#93C6BF", "#AE9FD6", "#3B3553"],
  },
  fonts: { display: "Bungee", body: "Rubik" },
  radius: 0,
  border_width: "3px",
  shadow: { x: "4px", y: "4px", blur: 0, color: "#2E2A36" },
};

describe("theme tokens", () => {
  it("parses the default enaibler theme (rounded, soft shadow)", () => {
    expect(DEFAULT_THEME.visual_style).toBe("soft");
    expect(Number.parseFloat(DEFAULT_THEME.radius)).toBeGreaterThan(0);
    expect(DEFAULT_THEME.shadow.blur).not.toBe("0px");
  });

  it("normalises numeric lengths to px", () => {
    const theme = themeSchema.parse(tenant0);
    expect(theme.radius).toBe("0px");
    expect(theme.shadow.blur).toBe("0px");
    expect(theme.border_width).toBe("3px");
  });

  it("maps tokens to CSS variables", () => {
    const css = themeToCssVariables(themeSchema.parse(tenant0));
    expect(css).toMatchObject({
      "--tenant-ink": "#2E2A36",
      "--tenant-surface": "#F3EBDD",
      "--tenant-primary": "#DD7F6C",
      "--tenant-radius": "0px",
      "--tenant-border-width": "3px",
      "--tenant-shadow": "4px 4px 0px #2E2A36",
      "--tenant-font-body":
        '"Rubik", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      "--tenant-accent-1": "#E6C878",
    });
  });

  it("picks a readable text colour for the primary button", () => {
    const css = themeToCssVariables(themeSchema.parse(tenant0));
    expect(css["--tenant-on-primary"]).toBe("#2E2A36");
    const blue = themeToCssVariables(
      themeSchema.parse({ ...tenant0, colors: { ...tenant0.colors, primary: "#1D3FBF" } }),
    );
    expect(blue["--tenant-on-primary"]).toBe("#FFFFFF");
  });

  it("respects an explicit on_primary colour", () => {
    const css = themeToCssVariables(
      themeSchema.parse({ ...tenant0, colors: { ...tenant0.colors, on_primary: "#FFFFFF" } }),
    );
    expect(css["--tenant-on-primary"]).toBe("#FFFFFF");
  });

  it.each([
    [
      "colour",
      { colors: { ...tenant0.colors, primary: "red; background: url(https://evil.example)" } },
    ],
    ["font", { fonts: { display: 'Bungee"; } body { display: none', body: "Rubik" } }],
    ["length", { radius: "4px; position: fixed" }],
    ["shadow colour", { shadow: { x: 1, y: 1, blur: 0, color: "var(--x)" } }],
  ])("rejects CSS injection through the %s token", (_label, patch) => {
    expect(themeSchema.safeParse({ ...tenant0, ...patch }).success).toBe(false);
  });

  it("cycles accents for paths without their own colour", () => {
    const theme = themeSchema.parse(tenant0);
    expect(pathColor(theme, 0)).toBe("#E6C878");
    expect(pathColor(theme, 5)).toBe("#93C6BF");
    expect(pathColor(theme, 1, "#123456")).toBe("#123456");
  });
});

describe("contrast", () => {
  it("computes WCAG contrast ratios", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrastRatio("#FFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("chooses the most readable candidate", () => {
    expect(mostReadable("#FFFF00", ["#000000", "#FFFFFF"])).toBe("#000000");
    expect(mostReadable("#000080", ["#000000", "#FFFFFF"])).toBe("#FFFFFF");
  });
});

describe("theme readability", () => {
  const base = themeSchema.parse(enaiblerTokens);

  it("accepts enaibler's default theme", () => {
    expect(themeContrastIssues(base)).toEqual([]);
  });

  it("blocks pale text on a pale background and unreadable buttons", () => {
    const pale = { ...base, colors: { ...base.colors, ink: "#C8C8C8" } };
    expect(themeContrastIssues(pale).map((issue) => [issue.code, issue.severity])).toEqual([
      ["text_on_surface", "error"],
      ["text_on_card", "error"],
    ]);
    const button = {
      ...base,
      colors: { ...base.colors, primary: "#FFE066", on_primary: "#FFFFFF" },
    };
    expect(themeContrastIssues(button)).toMatchObject([
      { code: "text_on_primary", severity: "error" },
    ]);
  });

  it("maps a website's fonts to the closest bundled family", () => {
    expect(closestBundledFont("Montserrat")).toBe("Montserrat");
    expect(closestBundledFont("open sans")).toBe("Open Sans");
    expect(closestBundledFont("Proxima Nova")).toBe("Montserrat");
    expect(closestBundledFont("Georgia")).toBe("Merriweather");
    expect(closestBundledFont("Source Sans Pro")).toBe("Open Sans");
    expect(closestBundledFont("-apple-system")).toBe("Inter");
    expect(closestBundledFont("Helvetica Neue")).toBe("Inter");
  });
});

describe("uploaded fonts and logo", () => {
  const theme = (extra: Record<string, unknown>) =>
    themeSchema.safeParse({ ...structuredClone(DEFAULT_THEME), ...extra });
  const id = "0b7a1f6e-8a51-4d1c-9a55-3f0c2f7f9b10";

  it("takes font files only from our own storage", () => {
    const fonts = (src: string, family = "Acme Sans") => ({
      fonts: { ...DEFAULT_THEME.fonts, files: [{ family, src, weight: 700 }] },
    });
    expect(theme(fonts(`/files/${id}.woff2`)).success).toBe(true);
    expect(theme(fonts("https://cdn.example.com/acme.woff2")).success).toBe(false);
    expect(theme(fonts(`/files/${id}.woff2") ; x`)).success).toBe(false);
    expect(theme(fonts(`/files/${id}.woff2`, 'Acme"} body{'))).toMatchObject({ success: false });
  });

  it("writes @font-face rules for uploaded fonts", () => {
    const parsed = themeSchema.parse({
      ...structuredClone(DEFAULT_THEME),
      fonts: {
        display: "Acme Sans",
        body: "Inter",
        files: [
          { family: "Acme Sans", src: `/files/${id}.woff2`, weight: 700 },
          { family: "Acme Sans", src: `/files/${id}.ttf`, style: "italic" },
        ],
      },
    });
    expect(fontFaceCss(parsed)).toBe(
      [
        `@font-face{font-family:"Acme Sans";src:url("/files/${id}.woff2") format("woff2");font-weight:700;font-style:normal;font-display:swap}`,
        `@font-face{font-family:"Acme Sans";src:url("/files/${id}.ttf") format("truetype");font-weight:400;font-style:italic;font-display:swap}`,
      ].join("\n"),
    );
    expect(fontFaceCss(DEFAULT_THEME)).toBe("");
  });

  it("guesses family, weight and style from the file name", () => {
    expect(guessFontFace("AcmeSans-SemiBoldItalic.woff2")).toEqual({
      family: "Acme Sans",
      weight: 600,
      style: "italic",
    });
    expect(guessFontFace("acme_grotesk_extrabold.ttf")).toMatchObject({
      family: "acme",
      weight: 800,
    });
    expect(guessFontFace("Brandon-Regular.otf")).toEqual({
      family: "Brandon",
      weight: 400,
      style: "normal",
    });
  });

  it("keeps a logo with its PNG copy", () => {
    expect(
      theme({ logo: { src: `/files/${id}.svg`, png: `/files/${id}.png`, ratio: 3.2 } }),
    ).toMatchObject({ success: true, data: { logo: { show_name: true } } });
    expect(theme({ logo: { src: "https://example.com/logo.svg" } }).success).toBe(false);
  });
});
