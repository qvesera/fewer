/**
 * Pure helpers shared across tag-registry, tag-assignment, and tag-filter methods.
 */
import type { FewerEdge, FewerNode, SetNodeTagsOp } from "@/lib/fewer/types";
import type { GraphState } from "../types";
import { childrenMapOf } from "@/lib/fewer/validation";

/**
 * Node ids that the active tag filter should hide. A file node is hidden when
 * it carries none of the selected tags (OR semantics). A folder is hidden only
 * when neither it nor any node in its subtree carries a selected tag, so folders
 * that contain a match stay visible as structural anchors while folders that are
 * entirely free of matches collapse away. Returns [] when no filter.
 */
export function tagFilterHiddenNodeIds(
  nodes: FewerNode[],
  edges: FewerEdge[],
  tagFilter: string[],
): string[] {
  if (tagFilter.length === 0) return [];
  const tagSet = new Set(tagFilter);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const childrenMap = childrenMapOf(edges);
  const tagged = (n: FewerNode): boolean => {
    const nodeTags = n.data.tagIds ?? [];
    return nodeTags.some((t) => tagSet.has(t));
  };
  const cache = new Map<string, boolean>();
  function hasTaggedDescendant(id: string): boolean {
    const seen = cache.get(id);
    if (seen !== undefined) return seen;
    const node = nodeMap.get(id);
    if (!node) {
      cache.set(id, false);
      return false;
    }
    if (tagged(node)) {
      cache.set(id, true);
      return true;
    }
    for (const child of childrenMap.get(id) ?? []) {
      if (hasTaggedDescendant(child)) {
        cache.set(id, true);
        return true;
      }
    }
    cache.set(id, false);
    return false;
  }
  return nodes
    .filter((n) => {
      if (n.data.type === "file") return !tagged(n);
      if (n.data.type === "folder") return !hasTaggedDescendant(n.id);
      return false;
    })
    .map((n) => n.id);
}

/**
 * Rewrite `tagIds` on the nodes a predicate selects. Returns the new node array
 * plus the history diff for it, built in one pass so the recorded op and the
 * state it describes can never disagree. Nodes whose list is unchanged are left
 * alone, which is what makes a repeat assign a no-op that records nothing.
 */
export function withTagIds(
  nodes: FewerNode[],
  pick: (n: FewerNode) => boolean,
  next: (ids: string[]) => string[],
): { nodes: FewerNode[]; changes: SetNodeTagsOp["changes"] } {
  const changes: SetNodeTagsOp["changes"] = [];
  const out = nodes.map((n) => {
    if (!pick(n)) return n;
    const from = n.data.tagIds ?? [];
    const to = next(from);
    if (to.length === from.length && to.every((t, i) => t === from[i])) return n;
    changes.push({ nodeId: n.id, from, to });
    return { ...n, data: { ...n.data, tagIds: to } };
  });
  return { nodes: out, changes };
}

/**
 * Apply a tag-id rewrite to the nodes `pick` selects and record it as one
 * history entry. `withTagIds` reports no changes when the lists are equal, so a
 * repeat assign stays a no-op that also skips the node-array rebuild.
 */
export function writeTagIds(
  set: (partial: Pick<GraphState, "nodes" | "graphVersion">) => void,
  get: () => GraphState,
  pick: (n: FewerNode) => boolean,
  next: (ids: string[]) => string[],
): void {
  const { nodes, changes } = withTagIds(get().nodes, pick, next);
  if (changes.length > 0) get().pushOp({ type: "set-node-tags", changes });
  set({ nodes, graphVersion: get().graphVersion + 1 });
}

/** Idempotent list editors: a tag already present (or absent) keeps the array. */
export const addTagId = (tagId: string) => (ids: string[]) =>
  ids.includes(tagId) ? ids : [...ids, tagId];
export const removeTagId = (tagId: string) => (ids: string[]) => ids.filter((t) => t !== tagId);

/**
 * Merge the ids a tag layer hides back into `hiddenIds`. Ids the previous tag
 * filter hid are dropped unless another layer still owns them, so manual hides
 * (Hidden panel), auto-hide and the category filter all survive a tag-filter
 * change — and nothing stays hidden on behalf of a filter that is gone.
 */
export function mergeTagHiddenLayers(
  hiddenIds: string[],
  prevTagHiddenIds: string[],
  otherLayers: string[],
  nextTagHidden: string[],
): string[] {
  const prevTagSet = new Set(prevTagHiddenIds);
  const others = new Set(otherLayers);
  const baseHidden = hiddenIds.filter((id) => !prevTagSet.has(id) || others.has(id));
  return [...new Set([...baseHidden, ...nextTagHidden])];
}
