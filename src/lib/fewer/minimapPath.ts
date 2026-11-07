"use client";

import type { FewerNode } from "./types";
import { getNodeDimensions } from "./layout";

/**
 * Minimap geometry as SVG path data (T-225).
 *
 * React Flow's `<MiniMap>` mounts one `<MiniMapNode>` — a React component with
 * its own store subscription — per graph node: at 4 507 nodes that was 74 % of
 * the DOM, ~123k listeners and ~890 MB of transient garbage on open
 * (`.agents/doc/2026-10-26-open-profile.md`). The A/B proved it was NOT the
 * script wall — that was the canvas force-mount (`rfInternals.ts`) — but the
 * per-node elements/listeners stand, and at 25k nodes the rects alone would be
 * 190k+ DOM elements. The map only needs three shapes — folders, files,
 * selected — so it is built here as three path strings and painted as three
 * `<path>` elements: O(n) arithmetic, no per-node DOM, no per-node subscription.
 *
 * Pure and synchronous by design: this is the unit that has to be cheap and
 * correct, and it is the part worth testing.
 */

/** Bounds of everything drawn, in flow coordinates. */
export interface MinimapBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface MinimapGeometry {
  /** One `d` per bucket; selected draws last, on top. */
  folders: string;
  files: string;
  selected: string;
  /** Frame of the whole graph (all nodes, not just the drawn stride sample). */
  bounds: MinimapBounds;
  /** Rects actually emitted vs. skipped by the stride. */
  drawn: number;
  skipped: number;
}

/**
 * Hard ceiling on painted rects. Folders are never sampled away — they are the
 * shape of the tree — so this bounds the *file* path; above it, every k-th file
 * node is drawn. The path stays sub-megabyte at 100k nodes.
 */
export const MAX_MINIMAP_RECTS = 20000;

const EMPTY: MinimapGeometry = {
  folders: "",
  files: "",
  selected: "",
  bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  drawn: 0,
  skipped: 0,
};

/** Integer-rounded `M x y h w v h h -w v -h Z` — one subpath per rect. */
export function rectPath(x: number, y: number, w: number, h: number): string {
  return `M${Math.round(x)} ${Math.round(y)}h${Math.round(w)}v${Math.round(h)}h${-Math.round(w)}v${-Math.round(h)}Z`;
}

/**
 * Build the three path strings. Selection comes from `selectedIds` when given,
 * else from the nodes' own `selected` flag (the stamped RF array carries one).
 * Stride sampling keeps every folder and every selected node, and thins only
 * the files.
 */
export function buildMinimapGeometry(
  nodes: readonly FewerNode[],
  selectedIds?: ReadonlySet<string> | null,
  maxRects: number = MAX_MINIMAP_RECTS,
): MinimapGeometry {
  if (nodes.length === 0) return EMPTY;
  const isSelected = (n: FewerNode): boolean =>
    selectedIds ? selectedIds.has(n.id) : n.selected === true;

  // Bounds over every node — not just the drawn sample — so the frame does not
  // jump when the stride kicks in. No spread: `Math.min(...xs)` throws
  // RangeError past ~100k arguments (the trap the deleted CustomMiniMap had).
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let fileCount = 0;
  let folderCount = 0;
  let selectedCount = 0;

  for (const node of nodes) {
    if (node.hidden) continue;
    const { x, y } = node.position ?? { x: 0, y: 0 };
    const { w, h } = getNodeDimensions(node);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
    if (isSelected(node)) selectedCount++;
    else if (node.data?.type === "folder" || node.type === "folder") folderCount++;
    else fileCount++;
  }

  if (!Number.isFinite(minX)) return EMPTY;

  // Folders + selected always drawn; files thin to keep the total in budget.
  const always = folderCount + selectedCount;
  const stride = Math.max(1, Math.ceil((always + fileCount) / maxRects));

  let folders = "";
  let files = "";
  let selected = "";
  let drawn = 0;
  let skipped = 0;
  let fileSeen = 0;

  for (const node of nodes) {
    if (node.hidden) continue;
    const isSelectedNode = isSelected(node);
    const isFolder = node.data?.type === "folder" || node.type === "folder";
    if (!isSelectedNode && !isFolder) {
      if (fileSeen++ % stride !== 0) {
        skipped++;
        continue;
      }
    }
    const { x, y } = node.position ?? { x: 0, y: 0 };
    const { w, h } = getNodeDimensions(node);
    const d = rectPath(x, y, w, h);
    if (isSelectedNode) selected += d;
    else if (isFolder) folders += d;
    else files += d;
    drawn++;
  }

  return { folders, files, selected, bounds: { minX, minY, maxX, maxY }, drawn, skipped };
}
