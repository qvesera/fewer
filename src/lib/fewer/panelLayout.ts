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

/** Given a pointer x and viewport width, return which side to dock. */
export function dropSideForPointerX(x: number, viewportWidth: number): PanelSide {
  return x < viewportWidth / 2 ? "left" : "right";
}

// ── localStorage persistence ──

import type { PanelNode } from "./panelTree";
import { parseTree, migrateV1ToTree, serializeTree } from "./panelTree";

interface LayoutSnapshot {
  sidebarSide: PanelSide;
  panelTree: PanelNode;
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

/** Parse a localStorage value into a valid layout snapshot. Handles both v1 (flat arrays) and v2 (tree). Returns null on failure. */
export function parseLayoutStorage(raw: string | null): LayoutSnapshot | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    const sidebarSide: PanelSide = VALID_SIDES.has(v.sidebarSide) ? v.sidebarSide : "left";

    // v2: tree format
    if (v.panelTree) {
      const tree = parseTree(v.panelTree);
      if (tree) return { sidebarSide, panelTree: tree };
    }

    // v1: flat leftAreas/rightAreas → migrate
    if (Array.isArray(v.leftAreas) || Array.isArray(v.rightAreas)) {
      const tree = migrateV1ToTree(v);
      return { sidebarSide, panelTree: tree };
    }

    return null;
  } catch {
    return null;
  }
}

/** Serialize a layout snapshot for localStorage. */
export function serializeLayoutStorage(snap: LayoutSnapshot): string {
  return JSON.stringify({ sidebarSide: snap.sidebarSide, panelTree: serializeTree(snap.panelTree) });
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

/** Default layout: sidebar left, single graph canvas. */
export function defaultLayout(): LayoutSnapshot {
  return { sidebarSide: "left", panelTree: { kind: "leaf", area: createArea("graph"), primary: true } };
}
