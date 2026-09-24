"use client";
// Reveal + auto-hide helpers, verbatim from graphSlice.ts. No behavior change.
import type { FewerNode, FewerEdge } from "@/lib/fewer/types";
import { computeLargeFolderHiddenIds } from "@/lib/fewer/importMerge";

/**
 * The single reveal walk behind both show-subtree actions: seed `roots` into
 * the reveal set, then breadth-first over `edges` revealing hidden descendants —
 * never walking past a visible card, and stopping at cards the user hid
 * directly (independentlyHiddenIds) together with their whole subtree.
 */
export function walkSubtreeReveal(
  edges: FewerEdge[],
  hiddenSet: Set<string>,
  indieSet: Set<string>,
  roots: Iterable<string>,
): Set<string> {
  const toShow = new Set<string>();
  const queue: string[] = [];
  for (const id of roots) {
    if (toShow.has(id)) continue;
    toShow.add(id);
    queue.push(id);
  }
  while (queue.length) {
    const nid = queue.shift()!;
    for (const e of edges) {
      if (e.source !== nid || !hiddenSet.has(e.target)) continue;
      if (indieSet.has(e.target)) continue;
      if (!toShow.has(e.target)) {
        toShow.add(e.target);
        queue.push(e.target);
      }
    }
  }
  return toShow;
}

/**
 * Collect the reveal set for a bulk "show subtree" (used by Show Children):
 * each requested id that is currently hidden, plus every hidden descendant of
 * it, stopping at nodes the user hid directly (independentlyHiddenIds).
 */
export function collectShowSubtrees(
  edges: FewerEdge[],
  hiddenIds: string[],
  independentlyHiddenIds: string[],
  ids: string[],
): Set<string> {
  const hiddenSet = new Set(hiddenIds);
  return walkSubtreeReveal(
    edges,
    hiddenSet,
    new Set(independentlyHiddenIds),
    ids.filter((id) => hiddenSet.has(id)),
  );
}

/**
 * Live-reconcile the large-folder auto-hide filter against the current threshold.
 * Only `autoHiddenIds` are ever revealed; manual/depth/file hides are kept.
 */
export function reconcileAutoHide(
  nodes: FewerNode[],
  edges: FewerEdge[],
  hiddenIds: string[],
  autoHiddenIds: string[],
  revealedRootIds: string[],
  threshold: number,
): { hiddenIds: string[]; autoHiddenIds: string[] } {
  const target = computeLargeFolderHiddenIds(
    nodes.filter((n) => !new Set(hiddenIds).has(n.id)),
    edges,
    threshold,
    new Set(revealedRootIds),
  );
  const targetSet = new Set(target);
  const revealedRoots = new Set(revealedRootIds);
  const nextHidden = new Set(hiddenIds);
  const nextAuto = new Set<string>();
  for (const id of autoHiddenIds) {
    if (!targetSet.has(id) && !revealedRoots.has(id)) {
      nextHidden.delete(id);
    }
  }
  for (const id of targetSet) {
    nextHidden.add(id);
    nextAuto.add(id);
  }
  return { hiddenIds: [...nextHidden], autoHiddenIds: [...nextAuto] };
}
