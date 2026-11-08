import { useMemo } from "react";

export interface CanvasThemeColors {
  edge: string;
  folderBg: string;
  fileBg: string;
  folderIcon: string;
  fileIcon: string;
  bgDot: string;
  /** Selection accent (rings) — also the minimap's selection + viewport colour. */
  selectRing: string;
  /** Minimap scrim over everything outside the viewport (RF's maskColor). */
  minimapMask: string;
}

/** Read a CSS variable from :root (falling back to the bare var name). */
export function cssVar(name: string, fallback = ""): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * Resolve theme colors once per theme change so edges, minimap, and the
 * background dots follow light/dark/custom without hard-coded values.
 */
export function useCanvasThemeColors(
  themeMode: string,
  isDark: boolean,
  customTheme: unknown,
): CanvasThemeColors {
  return useMemo(() => {
    const edge = cssVar("--fewer-edge", isDark ? "rgba(173, 181, 189, 0.5)" : "rgba(100, 116, 139, 0.4)");
    const folderBg = cssVar("--fewer-folder-bg", "rgba(253, 126, 20, 0.12)");
    const fileBg = cssVar("--fewer-file-bg", "rgba(190, 75, 219, 0.18)");
    const folderIcon = cssVar("--fewer-folder-icon", "#ffa94d");
    const fileIcon = cssVar("--fewer-file-icon", "#e599f7");
    const bgDot = isDark ? "rgba(173, 181, 189, 0.18)" : "rgba(100, 116, 139, 0.2)";
    const selectRing = cssVar("--fewer-select-ring", "#22d3ee");
    // The mask sits over the panel's own frosted background, so it fades toward
    // the theme's tone rather than toward a card: black in dark, white in light
    // — the same trick React Flow's default maskColor pulls off with a flat
    // gray. Fixed rgba, not color-mix(): the desktop shell's WebKit lacks it.
    const minimapMask = isDark ? "rgba(2, 6, 23, 0.5)" : "rgba(255, 255, 255, 0.55)";
    return { edge, folderBg, fileBg, folderIcon, fileIcon, bgDot, selectRing, minimapMask };
  }, [themeMode, isDark, customTheme]);
}

