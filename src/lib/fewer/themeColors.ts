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

/**
 * Relative luminance (ITU-R BT.601 luma) of an rgb triplet, on the 0-255 scale.
 *
 * Integer inputs make this exact to three decimals, so a threshold decision can
 * never straddle a boundary through a rounding error — the legacy
 * `r * 0.299 + g * 0.587 + b * 0.114` form returned 127.99999999999999 for
 * #808080, where this returns exactly 128.
 *
 * Single source of truth for every "is this color light or dark?" call.
 */
export function luma(rgb: { r: number; g: number; b: number }): number {
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
}

/** Luma of a `#rrggbb` string, or null when unparseable. */
export function lumaHex(hex: string): number | null {
  const rgb = hexToRgb(hex);
  return rgb ? luma(rgb) : null;
}

/** The 128 midpoint: true when a color reads as light (luma strictly above). */
export function isLightRgb(rgb: { r: number; g: number; b: number }): boolean {
  return luma(rgb) > 128;
}

/** Clamp opacity to [0, 1] with two decimal precision. */
export function clampOpacity(opacity: number): number {
  if (!Number.isFinite(opacity)) return 1;
  return Math.min(1, Math.max(0, Math.round(opacity * 100) / 100));
}

/** Clamp a gradient angle to a whole number in [0, 360]. */
export function clampAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 135;
  return Math.round(Math.min(360, Math.max(0, angle)));
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
 * Minimum card-tint opacity for the desktop shell (T-091). WebKitGTK does not
 * render backdrop-filter behind transformed React Flow nodes, so the ~0.12
 * glass tint must stand alone there; the web keeps its translucent cards.
 */
export const SHELL_CARD_OPACITY_FLOOR = 0.92;

export function shellSlotOpacity(slotKey: string, opacity: number, shell: boolean): number {
  if (!shell) return opacity;
  if (slotKey === "folderBg" || slotKey === "fileBg") {
    return Math.max(opacity, SHELL_CARD_OPACITY_FLOOR);
  }
  return opacity;
}

/**
 * Build the `linear-gradient(...)` string for a color slot, or null when the
 * slot has no (valid) `gradientTo`. Opacity applies to both stops.
 */
export function toGradientCss(c: CustomThemeColor): string | null {
  if (!c.gradientTo || !hexToRgb(c.gradientTo)) return null;
  const angle = clampAngle(c.gradientAngle ?? 135);
  return `linear-gradient(${angle}deg, ${toCssColor(c.color, c.opacity)}, ${toCssColor(c.gradientTo, c.opacity)})`;
}

/**
 * CSS value for a color slot: gradient when configured, otherwise the solid color.
 * Used for preview swatches (single source of truth with the DOM application).
 */
export function toCssValue(c: CustomThemeColor): string {
  return toGradientCss(c) ?? toCssColor(c.color, c.opacity);
}

/** Mix two hex colors in sRGB space; `t` in [0,1] weighting toward `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return a;
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${mix(ra.r, rb.r).toString(16).padStart(2, "0")}${mix(ra.g, rb.g).toString(16).padStart(2, "0")}${mix(ra.b, rb.b).toString(16).padStart(2, "0")}`;
}

/**
 * WCAG 2.1 relative luminance (sRGB, with the linearisation step). This is NOT
 * the BT.601 `luma` above: luma answers "is this surface light or dark?",
 * luminance is the contrast formula's input, and they disagree by enough to
 * flip a result at the AA boundary.
 */
function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

/** Contrast ratio of two hex colours (WCAG 2.1): 1 = identical, 21 = black on
 *  white. Symmetric, so callers never need to care which is "in front".
 *  Null when either value is unparseable. */
export function contrastRatio(fg: string, bg: string): number | null {
  const a = hexToRgb(fg);
  const b = hexToRgb(bg);
  if (!a || !b) return null;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Alpha-over composite in sRGB channel space (the approximation CSS itself
 * uses): `fg` at `alpha` above `bg`. This is how a card actually paints - a
 * body colour is a TINT (0.12-0.18 opacity), never an opaque swatch - so any
 * contrast worth reporting has to be measured on the composite.
 */
export function compositeColor(fg: string, alpha: number, bg: string): string {
  const a = hexToRgb(fg);
  const b = hexToRgb(bg);
  if (!a || !b) return fg;
  const t = Math.min(1, Math.max(0, alpha));
  const ch = (front: number, back: number) => Math.round(front * t + back * (1 - t));
  const hex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${hex(ch(a.r, b.r))}${hex(ch(a.g, b.g))}${hex(ch(a.b, b.b))}`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const c = hexToRgb(hex);
  if (!c) return null;
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  let r = l;
  let g = l;
  let b = l;
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h / 360 + 1 / 3);
    g = hue2rgb(p, q, h / 360);
    b = hue2rgb(p, q, h / 360 - 1 / 3);
  }
  const hex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Move ONLY lightness toward 0 (darker) or 1 (lighter), keeping hue and
 *  saturation - a Fix can never turn a teal into a grey-teal. `t` is 0..1. */
function shiftLightness(color: string, toward: 0 | 1, t: number): string {
  const hsl = hexToHsl(color);
  if (!hsl) return color;
  const l = toward === 0 ? hsl.l * (1 - t) : hsl.l + (1 - hsl.l) * t;
  return hslToHex(hsl.h, hsl.s, Math.min(1, Math.max(0, l)));
}

export interface ContrastFix {
  color: string;
  ratio: number;
  /** False when no edit inside the budget clears the target - the caller must
   *  show that instead of pretending the fix landed. */
  reached: boolean;
}

/**
 * The smallest HUE-PRESERVING edit that clears `target` against `surface`,
 * where the candidate is painted at `opacity` over that surface - so a 0.15
 * body tint or a 0.6 edge is measured the way it actually renders.
 *
 * Direction comes from the SURFACE: a light surface is fixed by darkening, a
 * dark one by lightening. The old helper walked toward white *or* black and
 * kept whichever needed fewer steps - against a bright surface that is always
 * black, so "Fix" darkened text that measured 1.2:1 against an unrendered
 * accent while being ~11:1 on the real dark card.
 */
export function ensureContrastTinted(
  color: string,
  opacity: number,
  surface: string,
  target: number,
): ContrastFix {
  const now = contrastRatio(compositeColor(color, opacity, surface), surface);
  if (now === null) return { color, ratio: 0, reached: false };
  if (now >= target) return { color, ratio: now, reached: true };

  const surfaceRgb = hexToRgb(surface);
  const surfaceIsLight = surfaceRgb ? relativeLuminance(surfaceRgb) > 0.5 : true;
  const away: 0 | 1 = surfaceIsLight ? 0 : 1;
  const other: 0 | 1 = away === 0 ? 1 : 0;

  let best: ContrastFix = { color, ratio: now, reached: false };
  for (const dir of [away, other]) {
    for (let step = 1; step <= 20; step++) {
      const candidate = shiftLightness(color, dir, step / 20);
      const ratio = contrastRatio(compositeColor(candidate, opacity, surface), surface);
      if (ratio === null) continue;
      if (ratio >= target) return { color: candidate, ratio, reached: true };
      if (ratio > best.ratio) best = { color: candidate, ratio, reached: false };
    }
  }
  return best;
}

/** Opaque colour on an opaque surface - the shape the unit tests and any caller
 *  that has already resolved the composite itself use. */
export function ensureContrast(color: string, bg: string, target: number): string {
  return ensureContrastTinted(color, 1, bg, target).color;
}

/** Default opposite endpoint for a new gradient: darker for light colors, lighter for dark ones. */
export function suggestGradientEnd(base: string): string {
  const rgb = hexToRgb(base);
  if (!rgb) return base;
  return mixHex(base, isLightRgb(rgb) ? "#000000" : "#ffffff", 0.6);
}

/** Resolve one color slot from a possibly-legacy raw value, filling gaps from
 *  the slot's default. */
function migrateSlot(raw: unknown, def: CustomThemeColor): CustomThemeColor {
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
  const slot: CustomThemeColor = { color, opacity };
  // Carry optional gradient fields through (lazily — only when valid), so
  // gradient themes survive save/load and partial updates keep their gradient.
  if (raw && typeof raw === "object") {
    const g = (raw as { gradientTo?: unknown }).gradientTo;
    const a = (raw as { gradientAngle?: unknown }).gradientAngle;
    if (typeof g === "string" && hexToRgb(g)) slot.gradientTo = g;
    if (typeof a === "number") slot.gradientAngle = clampAngle(a);
  }
  return slot;
}

/**
 * Coerce an unknown (possibly legacy plain-string) custom theme into the
 * structured `{ color, opacity }` shape, filling gaps from defaults.
 */
export function migrateCustomTheme(input: unknown): CustomTheme {
  const out = {} as CustomTheme;
  const src = (input ?? {}) as Record<string, unknown>;
  for (const meta of THEME_COLOR_META) {
    out[meta.key] = migrateSlot(src[meta.key], DEFAULT_CUSTOM_THEME[meta.key]);
  }
  return out;
}

/** Extract a hex color + opacity from a legacy CSS string (hex or rgba). */
function parseLegacyColor(value: string): { color: string; opacity: number } | null {
  const rgb = hexToRgb(value.trim());
  if (rgb) {
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

/**
 * Luma cutoff for `--primary-foreground`. Deliberately above the 128 surface
 * midpoint: a mid-tone accent keeps white text instead of flipping to black.
 * Not the same threshold as `isLightRgb`, and not to be merged with it.
 */
export const PRIMARY_FG_LUMA_THRESHOLD = 140;

/**
 * `--primary-foreground`: the text color that reads on top of the primary
 * accent — black on bright accents, white otherwise. An unparseable accent
 * reads as black, which lands on the white branch.
 */
export function computePrimaryFgFinal(accent: string): string {
  return (lumaHex(accent) ?? 0) > PRIMARY_FG_LUMA_THRESHOLD ? "#000000" : "#ffffff";
}

/**
 * Derive the shadcn/ui CSS variables from a custom theme (pure — no DOM).
 * Card/muted backgrounds, border tones, and foreground contrast are computed
 * from the theme's background / text / accent slots.
 */
export function deriveShadcnVars(theme: CustomTheme): [string, string][] {
  const bg = theme.background.color;
  const fg = theme.defaultText.color;
  const subtle = theme.subtleText.color;
  const accent = theme.folderIcon.color;
  const handle = theme.handle.color;

  const bgRgb = hexToRgb(bg);
  const isLight = bgRgb ? isLightRgb(bgRgb) : true;

  // Derive card/muted backgrounds from the actual theme background. An
  // unparseable background keeps the legacy split — black rgb components (the
  // old `|| 0`) but light polarity — so it lightens upward from 0.
  const { r, g, b } = bgRgb ?? { r: 0, g: 0, b: 0 };

  // Card: slightly lighter than background for light themes, slightly darker for dark
  const cardR = isLight ? Math.min(255, r + 8) : Math.max(0, r - 8);
  const cardG = isLight ? Math.min(255, g + 8) : Math.max(0, g - 8);
  const cardB = isLight ? Math.min(255, b + 8) : Math.max(0, b - 8);
  const cardBg = `#${cardR.toString(16).padStart(2, "0")}${cardG.toString(16).padStart(2, "0")}${cardB.toString(16).padStart(2, "0")}`;

  // Muted: even more offset
  const mutedR = isLight ? Math.min(255, r + 15) : Math.max(0, r - 15);
  const mutedG = isLight ? Math.min(255, g + 15) : Math.max(0, g - 15);
  const mutedB = isLight ? Math.min(255, b + 15) : Math.max(0, b - 15);
  const mutedBg = `#${mutedR.toString(16).padStart(2, "0")}${mutedG.toString(16).padStart(2, "0")}${mutedB.toString(16).padStart(2, "0")}`;

  // Borders: subtle lines that work on any background
  const borderColor = isLight ? `rgba(${Math.round(r * 0.1)}, ${Math.round(g * 0.1)}, ${Math.round(b * 0.1)}, 0.2)` : `rgba(255, 255, 255, 0.08)`;
  const borderLight = isLight ? `rgba(${Math.round(r * 0.1)}, ${Math.round(g * 0.1)}, ${Math.round(b * 0.1)}, 0.12)` : `rgba(255, 255, 255, 0.05)`;

  const primaryFgFinal = computePrimaryFgFinal(accent);

  return [
    ["--background", toCssColor(bg, theme.background.opacity)],
    ["--foreground", toCssColor(fg, theme.defaultText.opacity)],
    ["--card", cardBg],
    ["--card-foreground", toCssColor(fg, theme.defaultText.opacity)],
    ["--popover", cardBg],
    ["--popover-foreground", toCssColor(fg, theme.defaultText.opacity)],
    ["--primary", toCssColor(accent, 1)],
    ["--primary-foreground", primaryFgFinal],
    ["--secondary", mutedBg],
    ["--secondary-foreground", toCssColor(fg, theme.defaultText.opacity)],
    ["--muted", mutedBg],
    ["--muted-foreground", toCssColor(subtle, theme.subtleText.opacity)],
    ["--accent", toCssColor(accent, 0.15)],
    ["--accent-foreground", toCssColor(fg, theme.defaultText.opacity)],
    ["--border", borderColor],
    ["--input", borderLight],
    ["--ring", toCssColor(handle, theme.handle.opacity)],
    ["--sidebar", cardBg],
    ["--sidebar-foreground", toCssColor(fg, theme.defaultText.opacity)],
    ["--sidebar-border", borderLight],
  ];
}

/**
 * Adaptive chip colors for the "N nodes hidden" pill on the canvas. Derives a
 * readable background/text pair from the canvas background's luminance:
 * dark backgrounds get a lightened chip, light backgrounds a darkened one.
 * Pass the raw `--fewer-background` var (or undefined when unavailable);
 * non-hex values (gradients) fall back to no styling.
 */
export interface CanvasChipStyle {
  backgroundColor?: string;
  color?: string;
}

export function canvasChipStyle(rawBackground: string | undefined): CanvasChipStyle {
  const bg = rawBackground?.trim() || "#0b0b13";
  const rgb = hexToRgb(bg);
  if (!rgb) return {};
  const { r, g, b } = rgb;
  if (isLightRgb(rgb)) {
    return {
      backgroundColor: `rgba(${Math.round(r * 0.25)}, ${Math.round(g * 0.25)}, ${Math.round(b * 0.25)}, 0.8)`,
      color: "rgba(255, 255, 255, 0.9)",
    };
  }
  return {
    backgroundColor: `rgba(${Math.min(255, Math.round(r * 0.5 + 128))}, ${Math.min(255, Math.round(g * 0.5 + 128))}, ${Math.min(255, Math.round(b * 0.5 + 128))}, 0.8)`,
    color: "rgba(0, 0, 0, 0.85)",
  };
}