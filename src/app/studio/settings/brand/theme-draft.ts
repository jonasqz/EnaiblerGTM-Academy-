import {
  themeSchema,
  type FontFile,
  type Logo,
  type Theme,
  type ThemeInput,
  type VisualStyle,
} from "@/core/theme/schema";

/*
 * The brand editor works on a small, form-friendly draft and turns it into
 * theme tokens (the same shape as a manifest's `theme` block).
 */

export type ShadowKind = "none" | "soft" | "hard";

export interface ThemeDraft {
  ink: string;
  surface: string;
  card: string;
  primary: string;
  /** null: picked automatically for contrast. */
  onPrimary: string | null;
  accents: string[];
  display: string;
  body: string;
  radius: number;
  borderWidth: number;
  shadow: ShadowKind;
  style: VisualStyle;
  /** Brand assets: presets and imports keep them. */
  logo: Logo | null;
  fontFiles: FontFile[];
  /** From a manifest; the editor keeps them as they are. */
  sourceUrls: string[];
}

/** What presets and the website import suggest: the look, not the assets. */
export type LookDraft = Omit<ThemeDraft, "logo" | "fontFiles" | "sourceUrls">;

function px(length: string): number {
  const value = Number.parseFloat(length);
  if (Number.isNaN(value)) return 0;
  return length.endsWith("rem") || length.endsWith("em") ? value * 16 : value;
}

/** #abc → #aabbcc, alpha dropped (the editor's colour inputs are opaque). */
export function opaqueHex(hex: string): string {
  let value = hex.replace(/^#/, "");
  if (value.length === 3 || value.length === 4)
    value = value
      .slice(0, 3)
      .split("")
      .map((ch) => ch + ch)
      .join("");
  return `#${value.slice(0, 6).toLowerCase()}`;
}

export function draftFromTheme(theme: Theme): ThemeDraft {
  const blur = px(theme.shadow.blur);
  const offset = px(theme.shadow.x) !== 0 || px(theme.shadow.y) !== 0;
  return {
    ink: opaqueHex(theme.colors.ink),
    surface: opaqueHex(theme.colors.surface),
    card: opaqueHex(theme.colors.card),
    primary: opaqueHex(theme.colors.primary),
    onPrimary: theme.colors.on_primary ? opaqueHex(theme.colors.on_primary) : null,
    accents: theme.colors.accents.slice(0, 4).map(opaqueHex),
    display: theme.fonts.display,
    body: theme.fonts.body,
    radius: Math.round(px(theme.radius)),
    borderWidth: Math.round(px(theme.border_width)),
    shadow: blur === 0 && offset ? "hard" : blur > 0 ? "soft" : "none",
    style: theme.visual_style,
    logo: theme.logo ?? null,
    fontFiles: theme.fonts.files,
    sourceUrls: theme.fonts.source_urls,
  };
}

export function themeFromDraft(draft: ThemeDraft): ThemeInput {
  const shadow =
    draft.shadow === "hard"
      ? { x: "4px", y: "4px", blur: "0px", color: draft.ink }
      : draft.shadow === "soft"
        ? { x: "0px", y: "8px", blur: "24px", color: `${draft.ink}1f` }
        : { x: "0px", y: "0px", blur: "0px", color: "#00000000" };
  return {
    colors: {
      ink: draft.ink,
      surface: draft.surface,
      card: draft.card,
      primary: draft.primary,
      ...(draft.onPrimary ? { on_primary: draft.onPrimary } : {}),
      accents: draft.accents,
    },
    fonts: {
      display: draft.display,
      body: draft.body,
      source_urls: draft.sourceUrls,
      files: draft.fontFiles,
    },
    radius: `${draft.radius}px`,
    border_width: `${draft.borderWidth}px`,
    shadow,
    visual_style: draft.style,
    ...(draft.logo ? { logo: draft.logo } : {}),
  };
}

export function parseDraft(draft: ThemeDraft): Theme | null {
  const parsed = themeSchema.safeParse(themeFromDraft(draft));
  return parsed.success ? parsed.data : null;
}

/** Starting points; everything stays editable. */
export const PRESETS: Array<{ name: string; draft: LookDraft }> = [
  {
    name: "Clean",
    draft: {
      ink: "#191b22",
      surface: "#f6f5f1",
      card: "#ffffff",
      primary: "#3b5bdb",
      onPrimary: null,
      accents: ["#7c9cff", "#4fb99f", "#f0b64a", "#e0735c"],
      display: "Inter",
      body: "Inter",
      radius: 14,
      borderWidth: 1,
      shadow: "soft",
      style: "soft",
    },
  },
  {
    name: "Bold outlined",
    draft: {
      ink: "#1f1d2b",
      surface: "#fff4e0",
      card: "#fffbf3",
      primary: "#ff6b4a",
      onPrimary: null,
      accents: ["#ffd23f", "#3bceac", "#8e7dd8", "#1f1d2b"],
      display: "Space Grotesk",
      body: "DM Sans",
      radius: 4,
      borderWidth: 2,
      shadow: "hard",
      style: "outlined",
    },
  },
  {
    name: "Editorial",
    draft: {
      ink: "#2b2622",
      surface: "#f7f3ec",
      card: "#fffdf9",
      primary: "#8c3b2f",
      onPrimary: null,
      accents: ["#c7883a", "#51708c", "#6b8f71", "#a15c7f"],
      display: "Playfair Display",
      body: "Lato",
      radius: 6,
      borderWidth: 1,
      shadow: "none",
      style: "soft",
    },
  },
];
