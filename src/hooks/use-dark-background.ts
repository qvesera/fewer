"use client";

import { useGraphStore } from "@/store/graphStore";

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
  const m = /^#?([0-9a-fA-F]{6})$/.exec(customTheme.background.color);
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const lum = ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
  return lum <= 128;
}
