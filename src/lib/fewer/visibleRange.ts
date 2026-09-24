import { NODE_ITEM_HEIGHT } from "./types";

/** Default overscan for virtual-scroll child lists. */
export const OVERSCAN = 5;

/**
 * Pure helper for virtual-scroll windowing.  Given the scroll state and
 * container dimensions, returns the visible range and layout metrics.
 *
 * Used by:
 * - `src/hooks/use-virtual-scroll.ts` (live DOM rendering)
 * - `src/lib/fewer/graphRenderer.ts` (SVG/PNG export — must agree with the
 *   on-screen window so exports show the same child rows as the canvas)
 */
export function visibleRange(
  scrollTop: number,
  containerHeight: number,
  totalItems: number,
  itemHeight: number = NODE_ITEM_HEIGHT,
  overscan: number = OVERSCAN,
): {
  totalHeight: number;
  startIndex: number;
  endIndex: number;
  visibleCount: number;
  offsetY: number;
} {
  const totalHeight = totalItems * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(totalItems, Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan);
  const visibleCount = endIndex - startIndex;
  const offsetY = startIndex * itemHeight;
  return { totalHeight, startIndex, endIndex, visibleCount, offsetY };
}

/**
 * Maximum number of child rows that fit in a folder card at the given height,
 * used by graphRenderer for SVG/PNG export (no scrolling — just the visible
 * slot count).  Offsets by 12px internal padding matching CustomNode's
 * `p-1.5` (6px top + 6px bottom).
 */
export function maxVisibleRows(
  folderHeight: number,
  itemHeight: number = NODE_ITEM_HEIGHT,
): number {
  const childListMaxHeight = Math.max(60, folderHeight - 72);
  return Math.max(0, Math.floor((childListMaxHeight - 12) / itemHeight));
}
