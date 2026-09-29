"use client";
// Reveal + auto-hide helpers, verbatim from graphSlice.ts. No behavior change.
import type { FewerNode, FewerEdge } from "@/lib/fewer/types";
import { childrenIndexOf } from "@/lib/fewer/graphIndex";
import { parentMapOf, ancestorChainOf } from "@/lib/fewer/validation";
import { computeLargeFolderHiddenIds } from "@/lib/fewer/importMerge";

/**
 * The single reveal walk behind both show-subtree actions: seed `roots` into
 * the reveal set, then breadth-first over the children index revealing hidden
 * descendants — never walking past a visible card, and stopping at cards the
 * user hid directly (independentlyHiddenIds) together with their whole subtree.
 *
 * ponytail: the index replaces a per-dequeue scan of the whole edge list, so
 * this is O(edges + nodes) instead of O(revealed × edges).
 */
export function walkSubtreeReveal(
  edges: FewerEdge[],
  hiddenSet: Set<string>,
  indieSet: Set<string>,
  roots: Iterable<string>,
): Set<string> {
  const toShow = new Set<string>();
  const children = childrenIndexOf(edges);
  const queue: string[] = [];
  for (const id of roots) {
    if (toShow.has(id)) continue;
    toShow.add(id);
    queue.push(id);
  }
  for (let i = 0; i < queue.length; i++) {
    for (const target of children.get(queue[i]) ?? []) {
      if (!hiddenSet.has(target)) continue;
      if (indieSet.has(target)) continue;
      if (!toShow.has(target)) {
        toShow.add(target);
        queue.push(target);
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
 * Ids ONE reveal gesture must un-hide: the card itself, the hidden ancestors
 * that would otherwise orphan it, and — for a folder — every hidden descendant,
 * stopping at cards the user hid directly.
 *
 * The single plan behind both reveal entry points (the sidebar's eye and the
 * canvas' hidden child row), so a gesture commits as one store write instead of
 * chaining showAncestors + showSubtree + eyeRevealForLeaf, which cost three
 * version bumps, three layout passes and three undo steps per click.
 */
export function planReveal(args: {
  edges: FewerEdge[];
  hiddenIds: string[];
  independentlyHiddenIds: string[];
  id: string;
  /** Folders reveal their whole subtree; a card only reveals its chain. */
  subtree: boolean;
}): Set<string> {
  const { edges, hiddenIds, independentlyHiddenIds, id, subtree } = args;
  const hiddenSet = new Set(hiddenIds);
  const toShow = new Set<string>();

  if (subtree) {
    for (const revealed of walkSubtreeReveal(edges, hiddenSet, new Set(independentlyHiddenIds), [id])) {
      toShow.add(revealed);
    }
  } else if (hiddenSet.has(id)) {
    toShow.add(id);
  }
  if (toShow.size === 0) return toShow;

  // A hidden ancestor would orphan the card, so reveal the chain up to the
  // first visible folder. Matches showAncestors.
  const parentMap = parentMapOf(edges);
  for (const ancestorId of ancestorChainOf(id, parentMap)) {
    if (!hiddenSet.has(ancestorId)) break;
    toShow.add(ancestorId);
  }
  return toShow;
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
  // One set for the whole pass: building it per node made this O(nodes ×
  // hiddenIds) — a 30k/15k graph spent seconds here, and every sidebar reveal
  // ran it.
  const hiddenSet = new Set(hiddenIds);
  const target = computeLargeFolderHiddenIds(
    nodes.filter((n) => !hiddenSet.has(n.id)),
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
