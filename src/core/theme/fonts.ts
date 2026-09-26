/**
 * Font families bundled with the app (self-hosted via @fontsource, imported
 * in src/app/fonts.css). Tenants can use any of these by name; other families
 * need `theme.fonts.source_urls` pointing at self-hosted @font-face CSS.
 */
export const BUNDLED_FONT_FAMILIES = ["Inter", "Rubik", "Bungee"] as const;

export function isBundledFont(family: string): boolean {
  return (BUNDLED_FONT_FAMILIES as readonly string[]).includes(family);
}
