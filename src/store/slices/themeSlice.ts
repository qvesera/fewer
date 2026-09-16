"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "./types";
import type { ThemeMode, CustomTheme } from "@/lib/fewer/types";
import { DEFAULT_CUSTOM_THEME, THEME_COLOR_META } from "@/lib/fewer/types";
import { toCssColor, toGradientCss, migrateCustomTheme, deriveShadcnVars } from "@/lib/fewer/themeColors";

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
  for (const [cssVar, value] of deriveShadcnVars(theme)) {
    root.style.setProperty(cssVar, value);
  }
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
