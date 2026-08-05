"use client";

/**
 * Minimal theme provider. The theme-init script runs server-side in the root
 * layout (to avoid FOUC before hydration); this component only re-applies the
 * theme after mount. Kept as a client component so children can read theme
 * state if needed.
 */

import { useEffect, useState, type ReactNode } from "react";
import { migrateCustomTheme } from "@/lib/fewer/themeColors";
import { applyCustomThemeToDOM } from "@/store/slices/themeSlice";

const STORAGE_KEY = "fewer-theme";
const STORAGE_CUSTOM = "fewer-custom-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [, setMounted] = useState(false);

  useEffect(() => {
    // Re-apply the stored theme on mount (hydration)
    const stored = localStorage.getItem(STORAGE_KEY) || "light";
    document.documentElement.classList.toggle("dark", stored === "dark");
    document.documentElement.style.colorScheme = stored;
    document.documentElement.setAttribute("data-theme", stored);
    if (stored === "custom") {
      try {
        const raw = localStorage.getItem(STORAGE_CUSTOM);
        if (raw) applyCustomThemeToDOM(migrateCustomTheme(JSON.parse(raw)));
      } catch {
        /* ignore */
      }
    }
    setMounted(true);
  }, []);

  return <>{children}</>;
}