import type { FewerEdge, FewerNode } from "./types";

/**
 * Identity-cached tree indexes over the store's node/edge arrays.
 *
 * Hiding a card is a *view* filter, not a removal: hidden nodes stay in
 * `store.nodes` / `store.edges` because folder cards still list them as dimmed
 * child rows. So any "find this node's children" that scans the edge list pays
 * for the WHOLE graph — hidden descendants included — once per lookup. With
 * per-card lookups on the render path (every mounted folder card rebuilds its
 * child rows) and per-dequeue scans in the walks below, that made hiding
 * children a performance cliff: the more you hid, the slower every frame got.
 *
 * Each index is built once per array and cached by the array's identity. The
 * store always replaces `nodes`/`edges` with a fresh array (never mutates in
 * place), so identity is a sound cache key: a changed graph is a new array and
 * therefore a new entry. The WeakMap lets an old graph be collected with its
 * index.
 *
 * The returned Maps are shared — treat them as read-only (every caller is).
 */
const childrenCache = new WeakMap<FewerEdge[], Map<string, string[]>>();
const parentCache = new WeakMap<FewerEdge[], Map<string, string>>();
const nodeCache = new WeakMap<FewerNode[], Map<string, FewerNode>>();

/**
 * parent id → its direct child ids, in edge order. A parent with no outgoing
 * edge has no entry (callers use `?? []`).
 */
export function childrenIndexOf(edges: FewerEdge[]): Map<string, string[]> {
  const hit = childrenCache.get(edges);
  if (hit) return hit;
  const index = new Map<string, string[]>();
  for (const e of edges) {
    const list = index.get(e.source);
    if (list) list.push(e.target);
    else index.set(e.source, [e.target]);
  }
  childrenCache.set(edges, index);
  return index;
}

/** Child id → parent id. Last edge wins on a fan-in (an imported multi-parent). */
export function parentIndexOf(edges: FewerEdge[]): Map<string, string> {
  const hit = parentCache.get(edges);
  if (hit) return hit;
  const index = new Map<string, string>();
  for (const e of edges) index.set(e.target, e.source);
  parentCache.set(edges, index);
  return index;
}

/** node id → node. Last wins on a duplicate id (an import can repeat one). */
export function nodeIndexOf(nodes: FewerNode[]): Map<string, FewerNode> {
  const hit = nodeCache.get(nodes);
  if (hit) return hit;
  const index = new Map<string, FewerNode>();
  for (const n of nodes) index.set(n.id, n);
  nodeCache.set(nodes, index);
  return index;
}