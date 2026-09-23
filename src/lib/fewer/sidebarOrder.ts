/**
 * Sidebar section ordering — pure helpers, bun-testable, no DOM.
 *
 * DEFAULT_SIDEBAR_ORDER matches the original hardcoded JSX order in Sidebar.tsx,
 * so existing users see zero visual change on upgrade.
 */
export type { AreaEditor } from "./panelLayout";
import type { AreaEditor } from "./panelLayout";

export const DEFAULT_SIDEBAR_ORDER: AreaEditor[] = [
  "file",
  "directories",
  "layout",
  "edges",
  "tags",
  "analytics",
  "hidden",
];

export const VALID_SECTION_IDS = new Set<string>(DEFAULT_SIDEBAR_ORDER);

/**
 * Normalise a saved sidebar order: drop unknown ids, collapse dupes,
 * and re-append any sections missing from the array (new sections in
 * a later release still appear).
 */
export function normalizeSidebarOrder(saved: unknown): AreaEditor[] {
  if (!Array.isArray(saved)) return [...DEFAULT_SIDEBAR_ORDER];
  const seen = new Set<string>();
  const ordered: AreaEditor[] = [];
  for (const id of saved) {
    if (typeof id !== "string" || !VALID_SECTION_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id as AreaEditor);
  }
  // ponytail: append missing ids at their default position — O(n*m) but n=7.
  for (const id of DEFAULT_SIDEBAR_ORDER) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered;
}

/** Move an id to a new index in the order array. */
export function moveSection(
  order: AreaEditor[],
  id: AreaEditor,
  toIndex: number,
): AreaEditor[] {
  const fromIndex = order.indexOf(id);
  if (fromIndex === -1 || fromIndex === toIndex) return order;
  const next = [...order];
  const [removed] = next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(next.length, toIndex)), 0, removed);
  return next;
}

export interface SectionRect {
  id: string;
  top: number;
  bottom: number;
}

/**
 * Given a sorted array of section rects and a pointer Y, return the index
 * the dragged item should be inserted at.  Uses midpoint crossing: dragging
 * past the centre of a section swaps the order.
 */
export function insertIndexForY(rects: SectionRect[], y: number): number {
  for (let i = 0; i < rects.length; i++) {
    const mid = (rects[i].top + rects[i].bottom) / 2;
    if (y < mid) return i;
  }
  return rects.length;
}
