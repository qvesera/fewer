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
    // The minimap's dim sheet is the BACKGROUND ITSELF at a fixed opacity
    // (fill-opacity is applied in GraphMinimap), so it follows every theme —
    // light, dark, custom — without knowing a thing about polarity. A fixed
    // black/white pair only ever knew about light/dark, which is why a dark
    // custom theme got a white scrim. Var reference, not color-mix(): the
    // desktop shell's WebKit lacks color-mix().
    const minimapMask = cssVar("--background", isDark ? "#0b0b13" : "#ffffff");
    return { edge, folderBg, fileBg, folderIcon, fileIcon, bgDot, selectRing, minimapMask };
  }, [themeMode, isDark, customTheme]);
}

