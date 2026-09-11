import { THEME_COLOR_META, type ThemeColorMeta, type CustomTheme, type CustomThemeColor } from "./types";

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

// ---------------------------------------------------------------------------
// Per-section undo (pure logic, unit-tested in themeEditor.test.ts)
// ---------------------------------------------------------------------------

/** Max undo steps retained per editor section. */
export const SECTION_UNDO_LIMIT = 50;
/** Edits closer together than this (ms) coalesce into a single undo step. */
export const SECTION_UNDO_COALESCE_MS = 600;

/** Compare a single slot's editable fields (incl. gradient). */
function slotEquals(a: CustomThemeColor, b: CustomThemeColor): boolean {
  return a.color === b.color && a.opacity === b.opacity && a.gradientTo === b.gradientTo && a.gradientAngle === b.gradientAngle;
}

/** True when any slot in `section` differs between `prev` and `next`. */
export function sectionDiffers(
  section: { keys: ThemeColorMeta[] },
  prev: CustomTheme,
  next: CustomTheme,
): boolean {
  return section.keys.some((m) => !slotEquals(prev[m.key] as CustomThemeColor, next[m.key] as CustomThemeColor));
}

/** Snapshot of one section's slots (the undoable unit). */
export function snapshotSection(
  section: { keys: ThemeColorMeta[] },
  theme: CustomTheme,
): Partial<CustomTheme> {
  const snap: Partial<CustomTheme> = {};
  for (const m of section.keys) snap[m.key] = { ...(theme[m.key] as CustomThemeColor) };
  return snap;
}

/**
 * Record theme changes into per-section undo stacks.
 *
 * - A change pushed onto a section's stack is the state *before* the change,
 *   so undoing restores it.
 * - Edits within `SECTION_UNDO_COALESCE_MS` of the previous edit coalesce into
 *   one step (keeps a picker drag from flooding history).
 * - When `undoing` is true, nothing is pushed — undo itself must not be
 *   undoable.
 *
 * Returns the (possibly new) stacks + last-change timestamps. Inputs are never
 * mutated (pure).
 */
export function recordSectionChange(
  sections: { title: string; keys: ThemeColorMeta[] }[],
  prev: CustomTheme,
  next: CustomTheme,
  stacks: Record<string, Partial<CustomTheme>[]>,
  lastChangeAt: Record<string, number>,
  now: number,
  undoing: boolean,
): {
  stacks: Record<string, Partial<CustomTheme>[]>;
  lastChangeAt: Record<string, number>;
  changed: boolean;
} {
  if (undoing) return { stacks, lastChangeAt, changed: false };

  const nextStacks: Record<string, Partial<CustomTheme>[]> = {};
  const nextLast: Record<string, number> = { ...lastChangeAt };
  let changed = false;

  for (const section of sections) {
    const stack = stacks[section.title] ?? [];
    nextStacks[section.title] = stack;

    if (!sectionDiffers(section, prev, next)) continue;
    changed = true;

    const last = lastChangeAt[section.title] ?? 0;
    if (now - last <= SECTION_UNDO_COALESCE_MS) continue; // coalesce into previous step

    const snapped = [...stack, snapshotSection(section, prev)];
    if (snapped.length > SECTION_UNDO_LIMIT) snapped.shift();
    nextStacks[section.title] = snapped;
    nextLast[section.title] = now;
  }

  return { stacks: nextStacks, lastChangeAt: nextLast, changed };
}

/** Number of undoable steps currently stored for a section. */
export function sectionUndoDepth(
  sectionTitle: string,
  stacks: Record<string, Partial<CustomTheme>[]>,
): number {
  return stacks[sectionTitle]?.length ?? 0;
}

/**
 * Pop the most recent snapshot off a section's undo stack. Returns the
 * snapshot to apply plus the remaining stack. Pure — input untouched.
 */
export function popSectionUndo(
  stack: Partial<CustomTheme>[],
): { snapshot: Partial<CustomTheme> | undefined; stack: Partial<CustomTheme>[] } {
  if (stack.length === 0) return { snapshot: undefined, stack };
  const snapshot = stack[stack.length - 1];
  return { snapshot, stack: stack.slice(0, -1) };
}

/** Editable color slots grouped into the editor's display sections. */
export const THEME_EDITOR_SECTIONS: { title: string; keys: ThemeColorMeta[] }[] = [
  { title: "Canvas & Text", keys: THEME_COLOR_META.filter((m) => ["background", "defaultText", "subtleText", "itemHover", "handle", "edge", "selectRing"].includes(m.key)) },
  { title: "Folders", keys: THEME_COLOR_META.filter((m) => m.key.startsWith("folder")) },
  { title: "Files", keys: THEME_COLOR_META.filter((m) => m.key.startsWith("file")) },
];