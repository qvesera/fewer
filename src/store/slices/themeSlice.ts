"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "./types";
import type { ThemeMode, CustomTheme } from "@/lib/fewer/types";
import { DEFAULT_CUSTOM_THEME, THEME_COLOR_META } from "@/lib/fewer/types";
import { toCssColor, migrateCustomTheme } from "@/lib/fewer/themeColors";

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

export const createThemeSlice: ThemeSliceCreator = (set, get) => ({
  themeMode: "dark",
  customTheme: loadCustomTheme(),

  setThemeMode: (mode) => {
    set({ themeMode: mode });
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_THEME, mode);
    if (mode === "custom") {
      applyCustomThemeToDOM(get().customTheme);
    } else {
      clearCustomThemeFromDOM();
      if (typeof document !== "undefined") {
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(mode);
        document.documentElement.style.colorScheme = mode;
      }
    }
  },

  setCustomTheme: (partial) => {
    const next = migrateCustomTheme({ ...get().customTheme, ...partial });
    set({ customTheme: next });
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_CUSTOM, JSON.stringify(next));
    }
    applyCustomThemeToDOM(next);
  },

  resetCustomTheme: () => {
    const next = { ...DEFAULT_CUSTOM_THEME };
    set({ customTheme: next });
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_CUSTOM, JSON.stringify(next));
    }
    applyCustomThemeToDOM(next);
  },
});

export function applyCustomThemeToDOM(theme: CustomTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const meta of THEME_COLOR_META) {
    const c = theme[meta.key];
    root.style.setProperty(meta.cssVar, toCssColor(c.color, c.opacity));
  }
}

export function clearCustomThemeFromDOM() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const meta of THEME_COLOR_META) root.style.removeProperty(meta.cssVar);
}