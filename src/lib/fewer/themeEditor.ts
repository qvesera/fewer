import { THEME_COLOR_META, type ThemeColorMeta } from "./types";

/**
 * Pure logic for the floating theme editor dialog (positioning, docking,
 * hex-alpha color conversion). DOM-free so it can be unit-tested with bun test;
 * the component in src/components/fewer/ThemeEditorDialog.tsx adapts browser
 * globals (window/document) into these functions' parameters.
 */

export const DIALOG_WIDTH = 360;
export const TOP_OFFSET = 80; // navbar + toolbar

/** Rect describing the canvas area the editor may occupy/dock to. */
export interface CanvasBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type DockEdge = "top" | "bottom" | "left" | "right";

/** Pill size used when clamping raw dock-drag positions. */
const DOCK_PILL_SIZE = 36;

/** Dialog width clamped to viewport (mobile-safe). */
export function dialogWidth(viewportWidth: number) {
  return Math.min(DIALOG_WIDTH, viewportWidth - 16);
}

export function clampPosition(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  dialogHeight?: number,
) {
  const w = dialogWidth(viewportWidth);
  const minX = 0;
  const maxX = Math.max(0, viewportWidth - w);
  const minY = TOP_OFFSET;
  const h = dialogHeight ?? Math.min(viewportHeight * 0.85, 600);
  const maxY = Math.max(TOP_OFFSET, viewportHeight - h);
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

/** Snap to nearest canvas edge, keeping the perpendicular position */
export function snapDockPosition(x: number, y: number, bounds: CanvasBounds): { x: number; y: number; edge: DockEdge } {
  const pad = 12;
  const vPillW = 26;
  const vPillH = 48;
  const hPillW = 80;
  const hPillH = 26;

  // Distance from each edge
  const distTop = y - bounds.top;
  const distBottom = (bounds.top + bounds.height) - y;
  const distLeft = x - bounds.left;
  const distRight = (bounds.left + bounds.width) - x;
  const minDist = Math.min(distTop, distBottom, distLeft, distRight);

  if (minDist === distTop) {
    // Top edge: keep x, snap y to top
    return { x: Math.max(bounds.left + pad, Math.min(bounds.left + bounds.width - pad - hPillW, x - hPillW / 2)), y: bounds.top + pad, edge: "top" };
  }
  if (minDist === distBottom) {
    return { x: Math.max(bounds.left + pad, Math.min(bounds.left + bounds.width - pad - hPillW, x - hPillW / 2)), y: bounds.top + bounds.height - pad - hPillH, edge: "bottom" };
  }
  if (minDist === distLeft) {
    return { x: bounds.left + pad, y: Math.max(bounds.top + pad, Math.min(bounds.top + bounds.height - pad - vPillH, y - vPillH / 2)), edge: "left" };
  }
  // Right edge
  return { x: bounds.left + bounds.width - pad - vPillW, y: Math.max(bounds.top + pad, Math.min(bounds.top + bounds.height - pad - vPillH, y - vPillH / 2)), edge: "right" };
}

/** Clamp raw dock drag position to canvas area */
export function clampDockRaw(x: number, y: number, bounds: CanvasBounds) {
  return {
    x: Math.max(bounds.left, Math.min(bounds.left + bounds.width - DOCK_PILL_SIZE, x)),
    y: Math.max(bounds.top, Math.min(bounds.top + bounds.height - DOCK_PILL_SIZE, y)),
  };
}

/**
 * Parse a react-colorful HexAlphaColorPicker output ("#RRGGBBAA", with or
 * without the "#" prefix) into a theme color slot. When no alpha channel is
 * present, `fallbackOpacity` (the slot's current opacity) is preserved.
 */
export function hexAlphaToColorOpacity(value: string, fallbackOpacity = 1): { color: string; opacity: number } {
  const hex = value.startsWith("#") ? value : `#${value}`;
  if (hex.length === 9) {
    const a = parseInt(hex.slice(7, 9), 16) / 255;
    return { color: hex.slice(0, 7), opacity: Math.round(a * 100) / 100 };
  }
  return { color: hex.slice(0, 7), opacity: fallbackOpacity };
}

/** Inverse of hexAlphaToColorOpacity: "#RRGGBB" + opacity -> "#RRGGBBAA". */
export function colorOpacityToHexAlpha(color: string, opacity: number): string {
  const a = Math.round(opacity * 255).toString(16).padStart(2, "0");
  return `${color}${a}`;
}

/** Editable color slots grouped into the editor's display sections. */
export const THEME_EDITOR_SECTIONS: { title: string; keys: ThemeColorMeta[] }[] = [
  { title: "Canvas & Text", keys: THEME_COLOR_META.filter((m) => ["background", "defaultText", "subtleText", "itemHover", "handle", "edge", "selectRing"].includes(m.key)) },
  { title: "Folders", keys: THEME_COLOR_META.filter((m) => m.key.startsWith("folder")) },
  { title: "Files", keys: THEME_COLOR_META.filter((m) => m.key.startsWith("file")) },
];