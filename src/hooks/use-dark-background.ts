"use client";

import { useGraphStore } from "@/store/graphStore";
import { hexToRgb, isLightRgb } from "@/lib/fewer/themeColors";

/**
 * Surface polarity: is the page background dark?
 *
 * The inverted overlay can't rely on the `dark` class — custom themes strip
 * both `light` and `dark` from <html> (see themeSlice.setThemeMode), so a
 * custom dark theme looks "light" to Tailwind. Read the actual source of
 * truth: themeMode, plus the custom background's luminance when custom.
 * ponytail: ignores background opacity — a translucent dark bg still reads
 * dark; if that ever breaks, compute against the composited canvas color.
 */
export function useDarkBackground() {
  const themeMode = useGraphStore((s) => s.themeMode);
  const customTheme = useGraphStore((s) => s.customTheme);
  if (themeMode === "dark") return true;
  if (themeMode === "light") return false;
  const rgb = hexToRgb(customTheme.background.color);
  if (!rgb) return true;
  return !isLightRgb(rgb);
}
