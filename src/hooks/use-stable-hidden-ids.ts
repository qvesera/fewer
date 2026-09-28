"use client";

import { useState } from "react";

/** Exact content compare — a joined key can alias two different lists. */
function sameIds(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Content-stable identity for a hidden-id list.
 *
 * `resolveViewSettings` re-runs on every render of every canvas, and once a view
 * has hide layers (Hide Children / Hide Files / per-view hide) it returns a
 * FRESH hiddenIds array even when the ids are unchanged. That array is a dep of
 * the visible-graph lens, the edge highlight rebuild and every mounted card's
 * child-list memo, so a positions-only write (a drag) re-filtered the whole
 * node set, re-mapped every node object and re-ran all of those — measured at
 * ~50ms per frame for 30 cards on a 30k-node graph. Holding the previous array
 * while the content is unchanged keeps those memos intact.
 *
 * Uses the documented adjust-state-during-render pattern: a fresh array with
 * equal contents is dropped, one with different contents replaces the state and
 * re-renders immediately. A wrong hidden set would be a wrong canvas, so the
 * compare is exact rather than a hash.
 */
export function useStableHiddenIds(ids: string[]): string[] {
  const [stable, setStable] = useState(ids);
  if (!sameIds(stable, ids)) setStable(ids);
  return stable;
}