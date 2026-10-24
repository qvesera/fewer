import type { FewerEdge, FewerNode, FileCategory, Tag } from "./types";
import { childrenMapOf } from "./validation";
import { nodeIndexOf } from "./graphIndex";
import { compareSiblings, DEFAULT_SORT_KEY, DEFAULT_SORT_DIR } from "./sorting";
import type { SortKey, SortDir } from "./sorting";
import { makeTagLabelLookup } from "./tags";
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
 * Ordering + already-hidden context for the auto-hide cap.
 *
 * `sortKey` / `sortDir` / `tagLabelById` reproduce the layout comparator, so
 * "the first N children" is the same order the user sees on the canvas.
 * `hiddenSeed` names ids already hidden by ANOTHER mechanism (manual, depth,
 * Hide Files, a saved graph's hides): they are never re-derived as auto-hides
 * and their folders are never re-capped.
 */
export interface AutoHideOptions {
  sortKey?: SortKey;
  sortDir?: SortDir;
  tagLabelById?: (id: string) => string;
  hiddenSeed?: Set<string>;
}

/** The store's current sort as an AutoHideOptions order (tags need a lookup). */
export function orderFromStore(
  s: { sortKey?: SortKey; sortDir?: SortDir; tags?: Tag[] },
): AutoHideOptions {
  return {
    sortKey: s.sortKey,
    sortDir: s.sortDir,
    tagLabelById: makeTagLabelLookup(s.tags ?? []),
  };
}

/**
 * The auto-hide cap: every folder shows its first `threshold` children (in the
 * sort order the canvas lays them out); every child at or past that index —
 * together with its whole subtree — is hidden. The rule cascades, so a folder
 * that itself surfaces still caps its own children.
 *
 * `revealedSet` holds ids the user explicitly revealed: those extra cards stay
 * visible on top of the first `threshold` and are never pulled back in.
 *
 * The single pass walks folders (skipping hidden ones), then one orphan pass
 * hides the descendants of every folder the pass decided to hide — running it
 * before or after the parent's decision yields the same set, so node order
 * cannot change the outcome.
 */
export function computeLargeFolderHiddenIds(
  nodes: FewerNode[],
  edges: FewerEdge[],
  threshold: number,
  revealedSet?: Set<string>,
  options?: AutoHideOptions,
): string[] {
  const childrenMap = childrenMapOf(edges);
  const nodeMap = nodeIndexOf(nodes);
  const revealed = revealedSet ?? new Set<string>();
  const seeded = options?.hiddenSeed ?? new Set<string>();
  const sortKey = options?.sortKey ?? DEFAULT_SORT_KEY;
  const sortDir = options?.sortDir ?? DEFAULT_SORT_DIR;
  const toHide = new Set<string>();

  // Dangling edge targets have no node to compare; compare by id as a plain
  // file so the comparator stays total (an inconsistent one would make the
  // "first N" selection jump between runs).
  const asNode = (id: string): FewerNode =>
    nodeMap.get(id) ?? ({ id, data: { label: id, type: "file" } } as FewerNode);
  const ordered = (ids: string[]): string[] =>
    [...ids].sort((a, b) => compareSiblings(asNode(a), asNode(b), sortKey, sortDir, options?.tagLabelById));

  const hideSubtree = (rootId: string): void => {
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop()!;
      if (toHide.has(id) || seeded.has(id) || revealed.has(id)) continue;
      toHide.add(id);
      for (const gc of childrenMap.get(id) ?? []) stack.push(gc);
    }
  };

  for (const node of nodes) {
    if (node.data.type !== "folder") continue;
    if (toHide.has(node.id) || seeded.has(node.id)) continue;
    const children = ordered(childrenMap.get(node.id) ?? []);
    for (let i = 0; i < children.length; i++) {
      if (i < threshold) continue;
      const cid = children[i];
      if (revealed.has(cid) || seeded.has(cid) || toHide.has(cid)) continue;
      hideSubtree(cid);
    }
  }

  // Orphan pass: a hidden folder's children never render on their own, so they
  // are hidden too — and, being hidden here, they land in the auto-hide set
  // (which is what a later reconcile must be able to re-derive).
  for (const node of nodes) {
    if (node.data.type !== "folder") continue;
    if (seeded.has(node.id) || !toHide.has(node.id)) continue;
    for (const cid of childrenMap.get(node.id) ?? []) hideSubtree(cid);
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
 *
 * `options` carries the sort order the cap follows (see `AutoHideOptions`).
 */
export function computeImportedHideSets(
  nodes: FewerNode[],
  edges: FewerEdge[],
  hiddenFileIds: string[] | undefined,
  showFiles: boolean,
  autoHideThreshold: number,
  maxDisplayDepth: number,
  categoryFilter: FileCategory[] | undefined,
  options?: AutoHideOptions,
): { idsToHide: string[]; autoHideIds: string[]; catHiddenIds: string[]; autoHideCount: number } {
  const base = new Set<string>(hiddenFileIds ?? []);

  let idsToHide = [...(hiddenFileIds ?? [])];
  if (!showFiles) {
    const fileIds = nodes.filter((n) => n.data.type === "file").map((n) => n.id);
    idsToHide = [...new Set([...idsToHide, ...fileIds])];
  }

  const autoHideIds = computeLargeFolderHiddenIds(nodes, edges, autoHideThreshold, new Set(), {
    ...options,
    // The saved graph's own manual hides are not auto-hides: skip their
    // folders instead of re-labelling their descendants as auto-hidden.
    hiddenSeed: new Set([...(options?.hiddenSeed ?? []), ...base]),
  });
  const depthIds = computeDisplayDepthHiddenIds(nodes, maxDisplayDepth);
  const catHiddenIds = categoryHiddenNodeIds(nodes, categoryFilter ?? []);

  idsToHide = [...new Set([...idsToHide, ...autoHideIds, ...depthIds, ...catHiddenIds])];
  const autoHideCount = autoHideIds.filter((id) => !base.has(id)).length;

    return { idsToHide, autoHideIds, catHiddenIds, autoHideCount };
}
