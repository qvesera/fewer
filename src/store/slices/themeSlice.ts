"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "./types";
import type { ThemeMode, CustomTheme } from "@/lib/fewer/types";
import { DEFAULT_CUSTOM_THEME, THEME_COLOR_META } from "@/lib/fewer/types";
import { toCssColor, toGradientCss, migrateCustomTheme } from "@/lib/fewer/themeColors";

const STORAGE_THEME = "fewer-theme";
const STORAGE_CUSTOM = "fewer-custom-theme";

export type ThemeSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    themeMode: ThemeMode;
    customTheme: CustomTheme;
    setThemeMode: (mode: ThemeMode) => void;
    setCustomTheme: (theme: Partial<CustomTheme>) => void;
    resetCustomTheme: () => void;
  }
>;

function loadCustomTheme(): CustomTheme {
  if (typeof window === "undefined") return { ...DEFAULT_CUSTOM_THEME };
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM);
    if (!raw) return { ...DEFAULT_CUSTOM_THEME };
    return migrateCustomTheme(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CUSTOM_THEME };
  }
}

/** Default theme = the device's preference, resolved to light/dark. Falls back
 *  to "dark" (SSR / no matchMedia) so store and DOM agree on first paint. */
function initThemeMode(): ThemeMode {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "dark";
}

export const createThemeSlice: ThemeSliceCreator = (set, get) => ({
  themeMode: initThemeMode(),
  customTheme: loadCustomTheme(),

  setThemeMode: (mode) => {
    set({ themeMode: mode });
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_THEME, mode);
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("light", "dark");
      if (mode !== "custom") {
        document.documentElement.classList.add(mode);
        document.documentElement.style.colorScheme = mode;
      } else {
        document.documentElement.style.colorScheme = "dark";
      }
    }
    if (mode === "custom") {
      applyCustomThemeToDOM(get().customTheme);
    } else {
      clearCustomThemeFromDOM();
    }
  },

  setCustomTheme: (partial) => {
    const next = migrateCustomTheme({ ...get().customTheme, ...partial });
    set({ customTheme: next });
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_CUSTOM, JSON.stringify(next));
    }
    // Only inject custom vars into the DOM while in "custom" mode — applying
    // them otherwise would override the Light/Dark palettes.
    if (get().themeMode === "custom") applyCustomThemeToDOM(next);
  },

  resetCustomTheme: () => {
    const next = { ...DEFAULT_CUSTOM_THEME };
    set({ customTheme: next });
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_CUSTOM, JSON.stringify(next));
    }
    if (get().themeMode === "custom") applyCustomThemeToDOM(next);
  },
});

export function applyCustomThemeToDOM(theme: CustomTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const meta of THEME_COLOR_META) {
    const c = theme[meta.key];
    // Main var always stays a solid color: `background-color` consumers
    // (minimap, SVG export, shadcn derivations) can't take a gradient.
    root.style.setProperty(meta.cssVar, toCssColor(c.color, c.opacity));
    // Gradient-capable slots expose a companion `-gradient` var that CSS
    // consumers opt into via `background: var(<grad>, var(<solid>))`.
    if (meta.gradientCssVar) {
      const gradient = toGradientCss(c);
      if (gradient) root.style.setProperty(meta.gradientCssVar, gradient);
      else root.style.removeProperty(meta.gradientCssVar);
    }
  }
  // Auto-derive border colors from body colors (same color, higher opacity)
  root.style.setProperty("--fewer-folder-border", toCssColor(theme.folderBg.color, 0.45));
  root.style.setProperty("--fewer-file-border", toCssColor(theme.fileBg.color, 0.45));

  // Map custom theme to shadcn/ui CSS variables for all UI elements
  const bg = theme.background.color;
  const fg = theme.defaultText.color;
  const subtle = theme.subtleText.color;
  const accent = theme.folderIcon.color;
  const handle = theme.handle.color;

  // Determine if background is light or dark for contrast
  const bgRgb = (() => { const m = /^#?([0-9a-fA-F]{6})$/.exec(bg); if (!m) return null; const n = parseInt(m[1], 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; })();
  const isLight = bgRgb ? (bgRgb.r * 0.299 + bgRgb.g * 0.587 + bgRgb.b * 0.114) > 128 : true;

  // Derive card/muted backgrounds from the actual theme background
  const bgHex = bg.replace("#", "");
  const r = parseInt(bgHex.substring(0, 2), 16) || 0;
  const g = parseInt(bgHex.substring(2, 4), 16) || 0;
  const b = parseInt(bgHex.substring(4, 6), 16) || 0;

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

  // Ensure foreground text always has good contrast
  const fgHex = fg.replace("#", "");
  const fgR = parseInt(fgHex.substring(0, 2), 16) || 0;
  const fgG = parseInt(fgHex.substring(2, 4), 16) || 0;
  const fgB = parseInt(fgHex.substring(4, 6), 16) || 0;
  const fgLum = fgR * 0.299 + fgG * 0.587 + fgB * 0.114;
  const fgIsLight = fgLum > 128;
  const primaryFg = isLight === fgIsLight ? (isLight ? "#ffffff" : "#ffffff") : (isLight ? "#ffffff" : "#ffffff");
  // Primary foreground should contrast with primary accent
  const accHex = accent.replace("#", "");
  const accR = parseInt(accHex.substring(0, 2), 16) || 0;
  const accG = parseInt(accHex.substring(2, 4), 16) || 0;
  const accB = parseInt(accHex.substring(4, 6), 16) || 0;
  const accLum = accR * 0.299 + accG * 0.587 + accB * 0.114;
  const primaryFgFinal = accLum > 140 ? "#000000" : "#ffffff";

  root.style.setProperty("--background", toCssColor(bg, theme.background.opacity));
  root.style.setProperty("--foreground", toCssColor(fg, theme.defaultText.opacity));
  root.style.setProperty("--card", cardBg);
  root.style.setProperty("--card-foreground", toCssColor(fg, theme.defaultText.opacity));
  root.style.setProperty("--popover", cardBg);
  root.style.setProperty("--popover-foreground", toCssColor(fg, theme.defaultText.opacity));
  root.style.setProperty("--primary", toCssColor(accent, 1));
  root.style.setProperty("--primary-foreground", primaryFgFinal);
  root.style.setProperty("--secondary", mutedBg);
  root.style.setProperty("--secondary-foreground", toCssColor(fg, theme.defaultText.opacity));
  root.style.setProperty("--muted", mutedBg);
  root.style.setProperty("--muted-foreground", toCssColor(subtle, theme.subtleText.opacity));
  root.style.setProperty("--accent", toCssColor(accent, 0.15));
  root.style.setProperty("--accent-foreground", toCssColor(fg, theme.defaultText.opacity));
  root.style.setProperty("--border", borderColor);
  root.style.setProperty("--input", borderLight);
  root.style.setProperty("--ring", toCssColor(handle, theme.handle.opacity));
  root.style.setProperty("--sidebar", cardBg);
  root.style.setProperty("--sidebar-foreground", toCssColor(fg, theme.defaultText.opacity));
  root.style.setProperty("--sidebar-border", borderLight);
}

export function clearCustomThemeFromDOM() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const meta of THEME_COLOR_META) {
    root.style.removeProperty(meta.cssVar);
    if (meta.gradientCssVar) root.style.removeProperty(meta.gradientCssVar);
  }
  // Also remove shadcn/ui CSS variables that were set by applyCustomThemeToDOM
  const uiVars = [
    "--background", "--foreground", "--card", "--card-foreground",
    "--popover", "--popover-foreground", "--primary", "--primary-foreground",
    "--secondary", "--secondary-foreground", "--muted", "--muted-foreground",
    "--accent", "--accent-foreground", "--border", "--input", "--ring",
    "--sidebar", "--sidebar-foreground", "--sidebar-border",
    "--fewer-folder-border", "--fewer-file-border",
  ];
  for (const v of uiVars) root.style.removeProperty(v);
}
