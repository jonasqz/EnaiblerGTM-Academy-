import { themeSchema, type Theme, type ThemeInput } from "@/core/theme/schema";

/**
 * enaibler's own look, used as the default tenant theme (brief §11, Appendix B).
 *
 * TODO(brand): the colour and font values below are placeholders. Replace them
 * with the values from the existing `enaibler-tokens.ts` / brand guide, which
 * is not in this repository yet. Keep the shape: radius, border width and
 * shadow are the tokens v2 adds so the same model can express tenant 0's
 * square, outlined style.
 */
export const enaiblerTokens = {
  colors: {
    ink: "#191B22",
    surface: "#F6F5F1",
    card: "#FFFFFF",
    primary: "#3B5BDB",
    accents: ["#7C9CFF", "#4FB99F", "#F0B64A", "#E0735C"],
  },
  fonts: {
    display: "Inter",
    body: "Inter",
  },
  radius: "14px",
  border_width: "1px",
  shadow: { x: 0, y: "6px", blur: "24px", color: "#191B2214" },
  visual_style: "soft",
} satisfies ThemeInput;

export const DEFAULT_THEME: Theme = themeSchema.parse(enaiblerTokens);
