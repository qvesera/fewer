"use client";
import type { FewerNode, FewerEdge, FileCategory } from "@/lib/fewer/types";
import { reconcileAutoHide } from "../graphSlice";

/**
 * Reveal phase of setShowFiles(true): every file whose parent folder is NOT
 * hidden. Files under hidden folders stay hidden to avoid orphan rendering.
 * Category filters keep non-matching files hidden even when "show files"
 * reveals the rest.
 */
export function collectRevealableFileIds(
  nodes: FewerNode[],
  edges: FewerEdge[],
  hiddenIds: string[],
  categoryFilter: FileCategory[],
): string[] {
  const fileIds = nodes.filter((n) => n.data.type === "file").map((n) => n.id);
  const parentMap = new Map<string, string>();
  for (const e of edges) parentMap.set(e.target, e.source);
  const hiddenSet = new Set(hiddenIds);
  const revealable = fileIds.filter((fid) => {
    const parentId = parentMap.get(fid);
    return !parentId || !hiddenSet.has(parentId);
  });
  if (categoryFilter.length === 0) return revealable;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return revealable.filter((id) => {
    const node = byId.get(id);
    const cat = node?.data.category;
    return node?.data.type === "folder" || (cat != null && categoryFilter.includes(cat));
  });
}

/**
 * Constraint phase of setShowFiles(true): the reveal list must not bypass
 * other hide mechanisms — keep files beyond the display-depth limit hidden,
 * keep independently-hidden files hidden, then re-apply the large-folder
 * auto-hide limit so files under over-threshold folders stay hidden.
 */
export function applyRevealLimits(args: {
  nodes: FewerNode[];
  edges: FewerEdge[];
  revealedHidden: string[];
  autoHiddenIds: string[];
  revealedRootIds: string[];
  autoHideThreshold: number;
  maxDisplayDepth: number;
  independentlyHiddenIds: string[];
  revealIds: string[];
}): { hiddenIds: string[]; autoHiddenIds: string[] } {
  const {
    nodes, edges, revealedHidden, autoHiddenIds, revealedRootIds,
    autoHideThreshold, maxDisplayDepth, independentlyHiddenIds, revealIds,
  } = args;
  const nodeDepth = new Map(nodes.map((n) => [n.id, n.data.depth ?? 0]));
  const indieSet = new Set(independentlyHiddenIds);
  const limited = new Set(
    revealIds
      .filter((id) => maxDisplayDepth <= 0 || (nodeDepth.get(id) ?? 0) <= maxDisplayDepth)
      .filter((id) => !indieSet.has(id)),
  );
  const afterReveal = revealedHidden.filter((id) => !limited.has(id));
  return reconcileAutoHide(
    nodes,
    edges,
    afterReveal,
    autoHiddenIds,
    revealedRootIds,
    autoHideThreshold,
  );
}
