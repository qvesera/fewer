"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "./types";
import type { FewerEdge, FewerNode, HistoryOp, SetNodeTagsOp } from "@/lib/fewer/types";
import { v4 as uuid } from "uuid";
import type { Tag } from "@/lib/fewer/tags";
import { TAG_PALETTE } from "@/lib/fewer/tags";
import { childrenMapOf } from "@/lib/fewer/validation";
import { captureViewState, viewStateOp } from "./historySlice";

export type TagsSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    /** Tag registry (id → Tag). Travels with the graph via snapshot. */
    tags: Tag[];
    /** Active tag-filter ids (OR semantics). Empty = no filter. */
    tagFilter: string[];
    /** Node ids that the active tag-filter has hidden (tracked for undo/redo merge). */
    tagFilterHiddenIds: string[];

    setTags: (tags: Tag[]) => void;
    createTag: (label: string, color?: string) => Tag;
    updateTag: (
      id: string,
      patch: Partial<Pick<Tag, "label" | "color">>,
    ) => void;
    deleteTag: (id: string) => void;
    assignTag: (nodeId: string, tagId: string) => void;
    unassignTag: (nodeId: string, tagId: string) => void;
    toggleNodeTag: (nodeId: string, tagId: string) => void;
    assignTagToNodes: (nodeIds: string[], tagId: string) => void;
    unassignTagFromNodes: (nodeIds: string[], tagId: string) => void;
    /**
     * Toggle a tag in the active filter. Uses the same hide/show mechanism
     * as the category filter in StatsPanel: non-matching nodes are added to
     * `hiddenIds` so they disappear from the canvas entirely (not dimmed).
     * Supports undo via the view-state history op.
     */
    setTagFilter: (ids: string[]) => void;
    toggleTagFilter: (id: string) => void;
    clearTagFilter: () => void;
  }
>;

/** Pick the next palette color by cycling through TAG_PALETTE. */
function nextColor(existing: Tag[]): string {
  return TAG_PALETTE[existing.length % TAG_PALETTE.length];
}

/**
 * Node ids that the active tag filter should hide. A file node is hidden when
 * it carries none of the selected tags (OR semantics). A folder is hidden only
 * when neither it nor any node in its subtree carries a selected tag, so folders
 * that contain a match stay visible as structural anchors while folders that
 * are entirely free of matches collapse away. Returns [] when no filter.
 *
 * Layout excludes hidden folders from the tree as roots, promoting their
 * matching children up a level, so a match is never orphaned from the canvas.
 */
function tagFilterHiddenNodeIds(
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
      // Folders stay visible only when they or a descendant matches the filter.
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
function withTagIds(
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
function writeTagIds(
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
const addTagId = (tagId: string) => (ids: string[]) =>
  ids.includes(tagId) ? ids : [...ids, tagId];
const removeTagId = (tagId: string) => (ids: string[]) => ids.filter((t) => t !== tagId);

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

export const createTagsSlice: TagsSliceCreator = (set, get) => ({
  tags: [],
  tagFilter: [],
  tagFilterHiddenIds: [],

  setTags: (tags) => set({ tags }),

  // Registry-only edits (create / rename / recolor / setTags) are deliberately
  // NOT recorded: the tag color picker fires `updateTag` on every drag tick, so
  // a single drag would bury the undo stack under dozens of entries. Deleting a
  // tag is different — it strips node data and filter state — so it records.
  createTag: (label, color) => {
    const trimmed = label.trim() || "Untitled";
    const tag: Tag = {
      id: `tag-${uuid().slice(0, 8)}`,
      label: trimmed,
      color: color ?? nextColor(get().tags),
    };
    set({ tags: [...get().tags, tag] });
    return tag;
  },

  updateTag: (id, patch) => {
    set({
      tags: get().tags.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    });
  },

  deleteTag: (id) => {
    const state = get();
    const {
      tags,
      tagFilter,
      tagFilterHiddenIds,
      hiddenIds,
      independentlyHiddenIds,
      autoHiddenIds,
      categoryHiddenIds,
    } = state;
    // Strip the tag from every node that carries it.
    const { nodes, changes } = withTagIds(
      state.nodes,
      (n) => n.data.tagIds?.includes(id) ?? false,
      (ids) => ids.filter((t) => t !== id),
    );
    // Also remove it from the active filter, and release the ids that filter had
    // hidden (other hide layers keep theirs — see mergeTagHiddenLayers).
    const nextFilter = tagFilter.filter((t) => t !== id);
    const nextHidden = tagFilterHiddenNodeIds(nodes, state.edges, nextFilter);
    const finalHidden = mergeTagHiddenLayers(
      hiddenIds,
      tagFilterHiddenIds,
      [...independentlyHiddenIds, ...autoHiddenIds, ...categoryHiddenIds],
      nextHidden,
    );
    const nextTags = tags.filter((t) => t.id !== id);
    const removed = nextTags.length !== tags.length;
    const viewChanged =
      removed ||
      nextFilter.join(",") !== tagFilter.join(",") ||
      JSON.stringify(finalHidden) !== JSON.stringify(hiddenIds);
    if (viewChanged || changes.length > 0) {
      // One composite entry: node data strip → registry entry + the filter and
      // hidden ids that entry owned. The view-state op carries the registry, so
      // undo puts the tag back instead of leaving its assignments orphaned.
      const viewBefore = { ...captureViewState(state), tags };
      const viewAfter = {
        ...viewBefore,
        tags: nextTags,
        hiddenIds: finalHidden,
        tagFilter: nextFilter,
        tagFilterHiddenIds: nextHidden,
      };
      const ops: HistoryOp[] = changes.length > 0 ? [{ type: "set-node-tags", changes }] : [];
      ops.push(viewStateOp(viewBefore, viewAfter));
      get().pushOp(ops);
    }
    set({
      tags: nextTags,
      tagFilter: nextFilter,
      tagFilterHiddenIds: nextHidden,
      hiddenIds: finalHidden,
      nodes,
      graphVersion: get().graphVersion + 1,
    });
  },

  assignTag: (nodeId, tagId) =>
    writeTagIds(set, get, (n) => n.id === nodeId, addTagId(tagId)),

  unassignTag: (nodeId, tagId) =>
    writeTagIds(set, get, (n) => n.id === nodeId, removeTagId(tagId)),

  toggleNodeTag: (nodeId, tagId) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (node.data.tagIds?.includes(tagId)) get().unassignTag(nodeId, tagId);
    else get().assignTag(nodeId, tagId);
  },
  /** Assign one tag to many nodes in a single history entry. Idempotent. */
  assignTagToNodes: (nodeIds, tagId) => {
    const idSet = new Set(nodeIds);
    writeTagIds(set, get, (n) => idSet.has(n.id), addTagId(tagId));
  },
  /** Remove one tag from many nodes in a single history entry. */
  unassignTagFromNodes: (nodeIds, tagId) => {
    const idSet = new Set(nodeIds);
    writeTagIds(set, get, (n) => idSet.has(n.id), removeTagId(tagId));
  },

  setTagFilter: (ids) => {
    const {
      nodes,
      hiddenIds,
      tagFilterHiddenIds,
      independentlyHiddenIds,
      autoHiddenIds,
      categoryHiddenIds,
    } = get();
    const nextTagHidden = tagFilterHiddenNodeIds(nodes, get().edges, ids);
    const finalHidden = mergeTagHiddenLayers(
      hiddenIds,
      tagFilterHiddenIds,
      [...independentlyHiddenIds, ...autoHiddenIds, ...categoryHiddenIds],
      nextTagHidden,
    );
    const before = captureViewState(get());
    const after = {
      ...before,
      hiddenIds: finalHidden,
      tagFilter: ids,
      tagFilterHiddenIds: nextTagHidden,
    };
    // The chip is part of the recorded view state, so a swap that hides the same
    // nodes (two tags over one node) still has to record — otherwise the filter
    // itself would be the one thing undo cannot take back.
    const filterChanged = (before.tagFilter ?? []).join(",") !== ids.join(",");
    if (JSON.stringify(after.hiddenIds) !== JSON.stringify(before.hiddenIds) || filterChanged) {
      get().pushOp(viewStateOp(before, after));
    }
    set({
      tagFilter: ids,
      tagFilterHiddenIds: nextTagHidden,
      hiddenIds: finalHidden,
      graphVersion: get().graphVersion + 1,
    });
  },

  toggleTagFilter: (id) => {
    const cur = get().tagFilter;
    const next = cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id];
    get().setTagFilter(next);
  },

  clearTagFilter: () => {
    get().setTagFilter([]);
  },
});
