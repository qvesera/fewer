import OpenColor from "open-color";
import type { CustomTheme, CustomThemeColor } from "./types";
import { THEME_COLOR_META, DEFAULT_CUSTOM_THEME } from "./types";

/** Full Open Color palette, keyed by family name. */
export const OPEN_COLOR: Record<string, string[]> = {
  ...(OpenColor as unknown as Record<string, string[]>),
  white: [OpenColor.white],
  black: [OpenColor.black],
};

/** Parse a `#rrggbb` hex string into rgb components, or null if invalid. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Clamp opacity to [0, 1] with two decimal precision. */
export function clampOpacity(opacity: number): number {
  if (!Number.isFinite(opacity)) return 1;
  return Math.min(1, Math.max(0, Math.round(opacity * 100) / 100));
}

/**
 * Build a CSS color string from a hex color + opacity.
 * Returns hex when opacity is 1, otherwise rgba.
 */
export function toCssColor(color: string, opacity: number): string {
  const rgb = hexToRgb(color);
  if (!rgb) return color.trim() || "#000000";
  const a = clampOpacity(opacity);
  if (a >= 1) return `#${rgb.r.toString(16).padStart(2, "0")}${rgb.g.toString(16).padStart(2, "0")}${rgb.b.toString(16).padStart(2, "0")}`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

/**
 * Coerce an unknown (possibly legacy plain-string) custom theme into the
 * structured `{ color, opacity }` shape, filling gaps from defaults.
 */
export function migrateCustomTheme(input: unknown): CustomTheme {
  const out = {} as CustomTheme;
  const src = (input ?? {}) as Record<string, unknown>;
  for (const meta of THEME_COLOR_META) {
    const def = DEFAULT_CUSTOM_THEME[meta.key];
    const raw = src[meta.key];
    let color = def.color;
    let opacity = def.opacity;
    if (typeof raw === "string") {
      // legacy plain CSS string (e.g. "rgba(...)" or "#hex")
      const parsed = parseLegacyColor(raw);
      if (parsed) {
        color = parsed.color;
        opacity = parsed.opacity;
      }
    } else if (raw && typeof raw === "object") {
      const c = (raw as { color?: unknown }).color;
      const o = (raw as { opacity?: unknown }).opacity;
      if (typeof c === "string" && hexToRgb(c)) color = c;
      if (typeof o === "number") opacity = clampOpacity(o);
    }
    out[meta.key] = { color, opacity };
  }
  return out;
}

/** Extract a hex color + opacity from a legacy CSS string (hex or rgba). */
function parseLegacyColor(value: string): { color: string; opacity: number } | null {
  const hex = /^#?([0-9a-fA-F]{6})$/.exec(value.trim());
  if (hex) {
    const rgb = hexToRgb(value.trim());
    if (!rgb) return null;
    const color = `#${rgb.r.toString(16).padStart(2, "0")}${rgb.g.toString(16).padStart(2, "0")}${rgb.b.toString(16).padStart(2, "0")}`;
    return { color, opacity: 1 };
  }
  const rgba = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([0-9.]+)\s*)?\)$/.exec(value.trim());
  if (rgba) {
    const r = Math.min(255, Number(rgba[1]));
    const g = Math.min(255, Number(rgba[2]));
    const b = Math.min(255, Number(rgba[3]));
    const color = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    return { color, opacity: clampOpacity(rgba[4] == null ? 1 : Number(rgba[4])) };
  }
  return null;
}

/** Resolve a color slot to a CSS-ready string (used for previews). */
export function resolveCss(theme: CustomTheme, key: keyof CustomTheme): string {
  const c = theme[key] as CustomThemeColor;
  return toCssColor(c.color, c.opacity);
}