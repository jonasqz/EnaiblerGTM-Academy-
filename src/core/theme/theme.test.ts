import { describe, expect, it } from "vitest";

import { contrastRatio, mostReadable } from "@/core/theme/color";
import { pathColor, themeToCssVariables } from "@/core/theme/css";
import { DEFAULT_THEME } from "@/core/theme/enaibler-tokens";
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
