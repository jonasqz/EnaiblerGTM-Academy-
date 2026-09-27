import { contrastRatio, mostReadable } from "@/core/theme/color";
import type { Theme } from "@/core/theme/schema";

/**
 * Readability guard for academy themes (WCAG 2.x): whatever a customer picks
 * or imports, body text must stay readable. Errors block saving a theme;
 * warnings are shown.
 */
export interface ContrastIssue {
  code: "text_on_surface" | "text_on_card" | "text_on_primary";
  severity: "error" | "warning";
  ratio: number;
  message: string;
}

export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_BUTTON_CONTRAST = 3;

export function buttonTextColor(theme: Theme): string {
  const { primary, ink, on_primary } = theme.colors;
  return on_primary ?? mostReadable(primary, [ink, "#FFFFFF"]);
}

export function themeContrastIssues(theme: Theme): ContrastIssue[] {
  const { ink, surface, card, primary } = theme.colors;
  const issues: ContrastIssue[] = [];
  const add = (
    code: ContrastIssue["code"],
    severity: ContrastIssue["severity"],
    ratio: number,
    what: string,
    needs: number,
  ) =>
    issues.push({
      code,
      severity,
      ratio: Math.round(ratio * 10) / 10,
      message: `${what} is hard to read: contrast ${ratio.toFixed(1)}:1, needs at least ${needs}:1.`,
    });

  const onSurface = contrastRatio(ink, surface);
  if (onSurface < MIN_TEXT_CONTRAST)
    add("text_on_surface", "error", onSurface, "Text on the page background", MIN_TEXT_CONTRAST);
  const onCard = contrastRatio(ink, card);
  if (onCard < MIN_TEXT_CONTRAST)
    add("text_on_card", "error", onCard, "Text on cards", MIN_TEXT_CONTRAST);
  const onPrimary = contrastRatio(buttonTextColor(theme), primary);
  if (onPrimary < MIN_BUTTON_CONTRAST)
    add("text_on_primary", "error", onPrimary, "Button text", MIN_BUTTON_CONTRAST);
  else if (onPrimary < MIN_TEXT_CONTRAST)
    add("text_on_primary", "warning", onPrimary, "Button text", MIN_TEXT_CONTRAST);
  return issues;
}
