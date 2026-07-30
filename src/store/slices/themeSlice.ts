import type { StateCreator } from "zustand";
import type { GraphState } from "./types";
import type { ThemeMode, CustomTheme } from "@/lib/fewer/types";
import { DEFAULT_CUSTOM_THEME, THEME_COLOR_META } from "@/lib/fewer/types";

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

export const createThemeSlice: ThemeSliceCreator = (set, get) => ({
  themeMode: "dark",
  customTheme: { ...DEFAULT_CUSTOM_THEME },

  setThemeMode: (mode) => {
    set({ themeMode: mode });
    if (typeof window !== "undefined") localStorage.setItem("fewer-theme", mode);
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
    set((s) => ({ customTheme: { ...s.customTheme, ...partial } }));
    applyCustomThemeToDOM(get().customTheme);
  },

  resetCustomTheme: () => {
    set({ customTheme: { ...DEFAULT_CUSTOM_THEME } });
    applyCustomThemeToDOM(DEFAULT_CUSTOM_THEME);
  },
});

function applyCustomThemeToDOM(theme: CustomTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const meta of THEME_COLOR_META) root.style.setProperty(meta.cssVar, theme[meta.key]);
}

function clearCustomThemeFromDOM() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const meta of THEME_COLOR_META) root.style.removeProperty(meta.cssVar);
}