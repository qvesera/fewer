/**
 * Pure helpers for the Blender-style panel area system.
 * DOM-free so it can be unit-tested with bun test.
 * Components in the UI layer call these for layout logic.
 */

export type AreaEditor =
  | "graph"
  | "file"
  | "directories"
  | "layout"
  | "edges"
  | "hidden"
  | "tags"
  | "analytics";

export interface PanelArea {
  id: string;
  width: number;
  editor: AreaEditor;
}

export type PanelSide = "left" | "right";

/** Visible label per editor type (for column header dropdowns + empty states). */
export const AREA_EDITOR_LABELS: Record<AreaEditor, string> = {
  graph: "Graph View",
  file: "File & Actions",
  directories: "Your Directories",
  layout: "Layout",
  edges: "Edges & Style",
  hidden: "Hidden Cards",
  tags: "Tags",
  analytics: "Graph Analytics",
};

export const DEFAULT_SECTION_WIDTH = 280;
export const DEFAULT_GRAPH_WIDTH = 480;
export const MIN_AREA_WIDTH = 200;
export const MAX_AREA_WIDTH = 560;

let _counter = 0;
/** Globally unique id for areas (works across SSR: increments only in browser). */
export function generateAreaId(): string {
  return `area-${Date.now()}-${++_counter}`;
}

/** Clamp a width to the allowed range. */
export function clampWidth(w: number): number {
  return Math.max(MIN_AREA_WIDTH, Math.min(MAX_AREA_WIDTH, w));
}

/** Create a new PanelArea with sane defaults for the editor type. */
export function createArea(editor: AreaEditor, width?: number): PanelArea {
  return {
    id: generateAreaId(),
    width: width ?? (editor === "graph" ? DEFAULT_GRAPH_WIDTH : DEFAULT_SECTION_WIDTH),
    editor,
  };
}

/** Which section editor ids are already docked (appear in any area). */
export function sectionsDockedAnywhere(left: PanelArea[], right: PanelArea[]): Set<string> {
  const s = new Set<string>();
  for (const a of left) if (a.editor !== "graph") s.add(a.editor);
  for (const a of right) if (a.editor !== "graph") s.add(a.editor);
  return s;
}

/** Given a pointer x and viewport width, return which side to dock. */
export function dropSideForPointerX(x: number, viewportWidth: number): PanelSide {
  return x < viewportWidth / 2 ? "left" : "right";
}

// ── localStorage persistence ──

interface LayoutSnapshot {
  sidebarSide: PanelSide;
  leftAreas: PanelArea[];
  rightAreas: PanelArea[];
}

const STORAGE_KEY = "fewer:panelLayout";

const VALID_EDITORS: Set<string> = new Set([
  "graph", "file", "directories", "layout", "edges", "hidden", "tags", "analytics",
]);
const VALID_SIDES: Set<string> = new Set(["left", "right"]);

function isValidArea(v: unknown): v is PanelArea {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.width === "number" &&
    typeof o.editor === "string" &&
    VALID_EDITORS.has(o.editor)
  );
}

/** Parse a localStorage value into a valid layout snapshot. Returns null on failure. */
export function parseLayoutStorage(raw: string | null): LayoutSnapshot | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    const sidebarSide: PanelSide = VALID_SIDES.has(v.sidebarSide) ? v.sidebarSide : "left";
    const leftAreas = Array.isArray(v.leftAreas) ? v.leftAreas.filter(isValidArea) : [];
    const rightAreas = Array.isArray(v.rightAreas) ? v.rightAreas.filter(isValidArea) : [];
    return { sidebarSide, leftAreas, rightAreas };
  } catch {
    return null;
  }
}

/** Serialize a layout snapshot for localStorage. */
export function serializeLayoutStorage(snap: LayoutSnapshot): string {
  return JSON.stringify(snap);
}

/** Load layout from localStorage (SSR-safe). */
export function loadLayoutFromStorage(): LayoutSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    return parseLayoutStorage(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Save layout to localStorage (SSR-safe). */
export function saveLayoutToStorage(snap: LayoutSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, serializeLayoutStorage(snap));
  } catch { /* ignore */ }
}

/** Clear layout from localStorage (SSR-safe). */
export function clearLayoutStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

/** Default layout: no areas, sidebar left. */
export function defaultLayout(): LayoutSnapshot {
  return { sidebarSide: "left", leftAreas: [], rightAreas: [] };
}
