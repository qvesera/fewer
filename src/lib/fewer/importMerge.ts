import type { FewerEdge, FewerNode, FileCategory } from "./types";
import { childrenMapOf } from "./validation";
import { categoryHiddenNodeIds } from "./categorize";

/** Preserve painter order: files before folders, reverse label, then raised edges. */
export function sortEdges(edges: FewerEdge[], nodes: FewerNode[]): FewerEdge[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  return [...edges].sort((a, b) => {
    const aNode = nodeMap.get(a.target);
    const bNode = nodeMap.get(b.target);
    const aType = aNode?.data.type ?? "file";
    const bType = bNode?.data.type ?? "file";
    const typeDiff = (aType === "folder" ? 1 : 0) - (bType === "folder" ? 1 : 0);
    if (typeDiff !== 0) return typeDiff;
    const aLabel = aNode?.data.label ?? "";
    const bLabel = bNode?.data.label ?? "";
    const labelDiff = bLabel.localeCompare(aLabel);
    if (labelDiff !== 0) return labelDiff;
    return (a.zIndex ?? 0) - (b.zIndex ?? 0);
  });
}

/** Shared duplicate/paste merge; history and search highlighting stay in the slice. */
export function mergeImportedGraph(
  nodes: FewerNode[],
  edges: FewerEdge[],
  newNodes: FewerNode[],
  newEdges: FewerEdge[],
): { nodes: FewerNode[]; edges: FewerEdge[] } {
  const mergedNodes = [...nodes.map((n) => ({ ...n, selected: false })), ...newNodes];
  return { nodes: mergedNodes, edges: sortEdges([...edges, ...newEdges], mergedNodes) };
}

/**
 * Pure hide-set primitives shared by the slice and the extracted import prep.
 * Re-exported from here so graphSlice and graphImport both depend on the lib
 * module (not on each other), avoiding a store→lib cycle.
 */

/** Ids of nodes deeper than `maxDepth`. `maxDepth <= 0` means unlimited. */
export function computeDisplayDepthHiddenIds(nodes: FewerNode[], maxDepth: number): string[] {
  if (maxDepth <= 0) return [];
  return nodes.filter((n) => (n.data.depth ?? 0) > maxDepth).map((n) => n.id);
}

/**
 * Ids of children (recursively) of folders that exceed `threshold` direct
 * children, used to auto-collapse large folders on import. `revealedSet` holds
 * ids the user has explicitly expanded, which are skipped.
 */
export function computeLargeFolderHiddenIds(
  nodes: FewerNode[],
  edges: FewerEdge[],
  threshold: number,
  revealedSet?: Set<string>,
): string[] {
  const childrenMap = childrenMapOf(edges);
  const toHide = new Set<string>();
  const revealed = revealedSet ?? new Set<string>();
  for (const node of nodes) {
    if (node.data.type !== "folder") continue;
    const directChildren = childrenMap.get(node.id) ?? [];
    // Skip already-hidden or explicitly-revealed children
    const visibleChildren = directChildren.filter((cid) => !toHide.has(cid) && !revealed.has(cid));
    if (visibleChildren.length > threshold) {
      const queue = [...visibleChildren];
      while (queue.length) {
        const cid = queue.shift()!;
        if (toHide.has(cid) || revealed.has(cid)) continue;
        toHide.add(cid);
        for (const gc of childrenMap.get(cid) ?? []) queue.push(gc);
      }
    }
  }
  return [...toHide];
}

/**
 * Compute the hide sets for an imported graph — file hiding, auto-hide of
 * large folders, depth-based hiding, and the persistent category filter — all
 * layered together exactly as `setGraph` does them. Pure: no store access.
 *
 * `hiddenFileIds` are pre-existing hides (a saved graph's manual hides) that
 * survive an import. `categoryFilter` is the active category filter (empty if
 * none). Returns:
 *  - `idsToHide`: combined, deduplicated hide set (what `setGraph` writes to
 *    `hiddenIds`).
 *  - `autoHideIds`: auto-hide-only ids (for the `autoHiddenIds` slice field).
 *  - `catHiddenIds`: category-filter-only ids (for the `categoryHiddenIds`
 *    slice field — tracked separately so the filter can be toggled without
 *    recomputing the whole import).
 *  - `autoHideCount`: how many auto-hidden ids were not already in the base
 *    hide set (the `autoHideCount` stat).
 */
export function computeImportedHideSets(
  nodes: FewerNode[],
  edges: FewerEdge[],
  hiddenFileIds: string[] | undefined,
  showFiles: boolean,
  autoHideThreshold: number,
  maxDisplayDepth: number,
  categoryFilter: FileCategory[] | undefined,
): { idsToHide: string[]; autoHideIds: string[]; catHiddenIds: string[]; autoHideCount: number } {
  const base = new Set<string>(hiddenFileIds ?? []);

  let idsToHide = [...(hiddenFileIds ?? [])];
  if (!showFiles) {
    const fileIds = nodes.filter((n) => n.data.type === "file").map((n) => n.id);
    idsToHide = [...new Set([...idsToHide, ...fileIds])];
  }

  const autoHideIds = computeLargeFolderHiddenIds(nodes, edges, autoHideThreshold, new Set());
  const depthIds = computeDisplayDepthHiddenIds(nodes, maxDisplayDepth);
  const catHiddenIds = categoryHiddenNodeIds(nodes, categoryFilter ?? []);

  idsToHide = [...new Set([...idsToHide, ...autoHideIds, ...depthIds, ...catHiddenIds])];
  const autoHideCount = autoHideIds.filter((id) => !base.has(id)).length;

    return { idsToHide, autoHideIds, catHiddenIds, autoHideCount };
}
