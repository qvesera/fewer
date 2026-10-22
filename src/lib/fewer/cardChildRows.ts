import type { FewerEdge, FewerNode } from "./types";
import { childrenIndexOf, nodeIndexOf } from "./graphIndex";
import { sortedChildRows } from "./nodeDisplay";

/**
 * Per-card child rows/ids with referential stability (T-219).
 *
 * Every mounted folder card used to subscribe to the store's WHOLE `nodes` and
 * `edges` arrays and re-sort its own children in a memo keyed on those array
 * identities — so one progressive-scan batch re-rendered and re-sorted every
 * mounted card, even cards whose subtree did not change. These helpers derive
 * one card's rows/ids and hand back the PREVIOUS array when the result is
 * unchanged (same child ids, same node refs, same order), so a selector over
 * them is `Object.is`-stable and zustand skips the re-render entirely.
 *
 * A scan batch swaps BOTH arrays every time, so an identity-keyed WeakMap
 * (the `graphIndex` pattern) would miss every call — the previous result would
 * be unreachable and stability impossible. Instead: one flat slot map per
 * function, content-compared on every call. A slot only changes hands when the
 * card's actual children changed, so a batch that touched other subtrees
 * returns the previous rows by reference.
 *
 * Retention: slots pin node refs from the last graph their parent belonged to.
 * The store's whole-graph writers (`setGraph`, `reset`) call
 * `resetCardChildSlots()` to drop them, so a graph replacement cannot leak the
 * previous graph's nodes through this cache.
 */

interface RowsSlot {
  edges: FewerEdge[];
  rows: FewerNode[];
}

const EMPTY_ROWS: FewerNode[] = [];

const rowsSlots = new Map<string, RowsSlot>();

/** Exact compare: same length, same node refs in the same order. */
function sameRows(a: FewerNode[], b: FewerNode[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * The child rows of `parentId` (folders first, app sort — `sortedChildRows`).
 * Returns the previous array reference when nothing about the card's children
 * changed, so memoized consumers can skip.
 */
export function childRowsOf(
  parentId: string,
  nodes: FewerNode[],
  edges: FewerEdge[],
): FewerNode[] {
  const slot = rowsSlots.get(parentId);
  if (slot && slot.edges === edges) return slot.rows;
  const rows = sortedChildRows(parentId, nodes, edges);
  if (slot && sameRows(slot.rows, rows)) {
    // Content unchanged — keep the previous REFERENCE so selectors don't fire.
    slot.edges = edges;
    return slot.rows;
  }
  rowsSlots.set(parentId, { edges, rows });
  return rows;
}

/**
 * Total child count for a card's badge — counts EDGES, including dangling
 * ones (same contract as `folderChildCount`), so it stays a plain number the
 * selector can compare by value. No slot needed: a number is already stable.
 */
export function childCountOf(parentId: string, edges: FewerEdge[]): number {
  return childrenIndexOf(edges).get(parentId)?.length ?? 0;
}

/** id → node lookup for one card's own fields (manual resize height etc.),
 *  reusing graphIndex's per-array cache instead of an O(N) `nodes.find`. */
export function nodeByIdOf(nodes: FewerNode[], id: string): FewerNode | undefined {
  return nodeIndexOf(nodes).get(id);
}

/** Test hook / whole-graph-writer hook: drop all slots. Call from `setGraph`
 *  and `reset` so a graph replacement cannot pin the old graph's nodes. */
export function resetCardChildSlots(): void {
  rowsSlots.clear();
}

export { EMPTY_ROWS };
