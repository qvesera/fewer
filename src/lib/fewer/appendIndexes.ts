import type { FewerEdge, FewerNode } from "./types";

/**
 * Incremental indexes for the progressive append path (T-219).
 *
 * `appendGraphBatch` used to rebuild THREE whole-graph structures on every
 * scan batch: a path→id map, an id→index map, and an edge-id Set — plus
 * `applySearchHighlight` cloned every node (fixed separately). At 20k nodes
 * over ~9.5k batches that is O(B·N) = 110 s of pure index building, and it is
 * the dominant cost of opening a big folder.
 *
 * The scan appends in BFS order and only ever ADDS nodes/edges between store
 * writes, so the maps can be maintained incrementally with a single mutable
 * slot, re-keyed to the array the store ends up holding:
 *
 *   const pathToId = pathIdIndexOf(state.nodes);   // hit: O(1); miss: O(N) once
 *   ...pathToId.set(newPath, id) as nodes are pushed...
 *   rekeyAppendIndexes(appliedNodes, nextEdges);   // slot now describes the new arrays
 *
 * A miss (undo, setGraph, relayout, any foreign writer replaced the array)
 * rebuilds once and goes incremental again — the same identity-cached pattern
 * as `graphIndex.ts`, but with ONE slot and explicit re-keying because the
 * callers mutate the maps.
 *
 * Safety: the maps are module-private to the append path and never exposed to
 * the store. The only map ever mutated is the one keyed to the CURRENT array
 * (a miss rebuilds instead of mutating a stale map), and the mutation and
 * re-key happen synchronously inside one `appendGraphBatch` call, so an undo
 * that restores an older array can never observe an over-complete map — it
 * just misses and rebuilds.
 */

interface AppendIndexes {
  nodes: FewerNode[];
  /** Absolute path → node id, for nodes whose data.path is set. */
  pathToId: Map<string, string>;
  /** Node id → index in the nodes array (for in-place size/symlink refresh). */
  idToIndex: Map<string, number>;
  /** Node id → node, maintained alongside so edge-order merges never rebuild
   *  a whole-graph Map per batch (nodeIndexOf's identity cache misses on the
   *  fresh array each append creates). */
  idToNode: Map<string, FewerNode>;
}

interface EdgeIndexes {
  edges: FewerEdge[];
  /** Edge id → true, for O(1) dedupe of incoming edges. */
  idSet: Set<string>;
}

let nodeSlot: AppendIndexes | null = null;
let edgeSlot: EdgeIndexes | null = null;

/** path→id + id→index + id→node for `nodes`. Hit when `nodes` is still the
 *  array the slot was last keyed to; a rebuild otherwise. Callers that ADD
 *  entries must follow with `rekeyAppendIndexes(nextNodes, …)`. */
export function pathIdIndexOf(nodes: FewerNode[]): Map<string, string> {
  if (!nodeSlot || nodeSlot.nodes !== nodes) {
    const pathToId = new Map<string, string>();
    const idToIndex = new Map<string, number>();
    const idToNode = new Map<string, FewerNode>();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      idToIndex.set(n.id, i);
      idToNode.set(n.id, n);
      if (n.data.path) pathToId.set(n.data.path, n.id);
    }
    nodeSlot = { nodes, pathToId, idToIndex, idToNode };
  }
  return nodeSlot.pathToId;
}

/** id→index for `nodes` — same slot, see `pathIdIndexOf`. */
export function idToIndexOf(nodes: FewerNode[]): Map<string, number> {
  // Ensure the slot is built (pathIdIndexOf and idToIndex share one pass).
  pathIdIndexOf(nodes);
  return nodeSlot!.idToIndex;
}

/** id→node for `nodes` — same slot, see `pathIdIndexOf`. Feed this to
 *  `mergeSortedEdges` instead of `nodeIndexOf`, which would rebuild an O(N)
 *  Map on the fresh array every batch. */
export function idToNodeOf(nodes: FewerNode[]): Map<string, FewerNode> {
  pathIdIndexOf(nodes);
  return nodeSlot!.idToNode;
}

/** Edge-id set for `edges` — hit on the keyed array, rebuild otherwise.
 *  Callers that ADD ids must follow with `rekeyAppendIndexes(…, nextEdges)`. */
export function edgeIdSetOf(edges: FewerEdge[]): Set<string> {
  if (!edgeSlot || edgeSlot.edges !== edges) {
    const idSet = new Set<string>();
    for (const e of edges) idSet.add(e.id);
    edgeSlot = { edges, idSet };
  }
  return edgeSlot.idSet;
}

/**
 * Point the slots at the arrays the store now holds. Only call when the maps
 * already describe those arrays exactly (same node ids/paths/indices, same
 * edge ids — reordering by `sortEdges` is fine, it preserves membership).
 * `nodes`/`edges` may be passed as null to drop a slot instead (e.g. the caller
 * kept the OLD array reference through and nothing needs re-keying).
 */
export function rekeyAppendIndexes(nodes: FewerNode[] | null, edges: FewerEdge[] | null): void {
  if (nodeSlot && nodes) nodeSlot.nodes = nodes;
  if (edgeSlot && edges) edgeSlot.edges = edges;
}

/** Test/reset hook: drop both slots (identity caching stays correct without
 *  this — a foreign array simply misses — but tests asserting rebuild counts
 *  need a clean start). */
export function resetAppendIndexes(): void {
  nodeSlot = null;
  edgeSlot = null;
}
