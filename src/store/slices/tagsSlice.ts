"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "./types";
import type { FewerNode } from "@/lib/fewer/types";
import { v4 as uuid } from "uuid";
import type { Tag } from "@/lib/fewer/tags";
import { TAG_PALETTE } from "@/lib/fewer/tags";
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
    updateTag: (id: string, patch: Partial<Pick<Tag, "label" | "color">>) => void;
    deleteTag: (id: string) => void;
    assignTag: (nodeId: string, tagId: string) => void;
    unassignTag: (nodeId: string, tagId: string) => void;
    toggleNodeTag: (nodeId: string, tagId: string) => void;
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
 * Compute node ids that should be hidden because they don't match the active
 * tag filter. A node matches when it carries at least one of the selected tags
 * (OR semantics). Folders are never hidden — only files and untagged entries.
 */
function tagFilterHiddenNodeIds(nodes: FewerNode[], tagFilter: string[]): string[] {
  if (tagFilter.length === 0) return [];
  const tagSet = new Set(tagFilter);
  return nodes
    .filter((n) => {
      // Folders are never hidden by tag filter (same as category filter).
      if (n.data.type === "folder") return false;
      const nodeTags = n.data.tagIds ?? [];
      // A node is hidden when it carries NONE of the selected tags.
      return !nodeTags.some((t) => tagSet.has(t));
    })
    .map((n) => n.id);
}

export const createTagsSlice: TagsSliceCreator = (set, get) => ({
  tags: [],
  tagFilter: [],
  tagFilterHiddenIds: [],

  setTags: (tags) => set({ tags }),

  createTag: (label, color) => {
    const trimmed = label.trim() || "Untitled";
    const tag: Tag = { id: `tag-${uuid().slice(0, 8)}`, label: trimmed, color: color ?? nextColor(get().tags) };
    set({ tags: [...get().tags, tag] });
    return tag;
  },

  updateTag: (id, patch) => {
    set({
      tags: get().tags.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    });
  },

  deleteTag: (id) => {
    const { tags, tagFilter } = get();
    // Strip the tag from every node that carries it.
    const nodes = get().nodes.map((n: FewerNode) =>
      n.data.tagIds?.includes(id)
        ? { ...n, data: { ...n.data, tagIds: n.data.tagIds.filter((t) => t !== id) } }
        : n,
    );
    // Also remove from the active filter if present.
    const nextFilter = tagFilter.filter((t) => t !== id);
    const nextHidden = tagFilterHiddenNodeIds(nodes, nextFilter);
    set({
      tags: tags.filter((t) => t.id !== id),
      tagFilter: nextFilter,
      tagFilterHiddenIds: nextHidden,
      nodes,
      graphVersion: get().graphVersion + 1,
    });
  },

  assignTag: (nodeId, tagId) => {
    const nodes = get().nodes.map((n) => {
      if (n.id !== nodeId) return n;
      const ids = n.data.tagIds ?? [];
      if (ids.includes(tagId)) return n;
      return { ...n, data: { ...n.data, tagIds: [...ids, tagId] } };
    });
    set({ nodes, graphVersion: get().graphVersion + 1 });
  },

  unassignTag: (nodeId, tagId) => {
    const nodes = get().nodes.map((n) => {
      if (n.id !== nodeId || !n.data.tagIds) return n;
      return { ...n, data: { ...n.data, tagIds: n.data.tagIds.filter((t) => t !== tagId) } };
    });
    set({ nodes, graphVersion: get().graphVersion + 1 });
  },

  toggleNodeTag: (nodeId, tagId) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (node.data.tagIds?.includes(tagId)) get().unassignTag(nodeId, tagId);
    else get().assignTag(nodeId, tagId);
  },

  setTagFilter: (ids) => {
    const { nodes, hiddenIds, tagFilterHiddenIds } = get();
    const nextTagHidden = tagFilterHiddenNodeIds(nodes, ids);
    const prevTagSet = new Set(tagFilterHiddenIds);
    // Drop the ids the previous tag filter hid, then add the ids this one hides.
    // Manual hides (from the Hidden panel) are preserved — only tracked
    // tag-filter-hidden ids are touched.
    const baseHidden = hiddenIds.filter((id) => !prevTagSet.has(id));
    const finalHidden = [...new Set([...baseHidden, ...nextTagHidden])];
    const before = captureViewState(get());
    const after = { ...before, hiddenIds: finalHidden };
    if (JSON.stringify(after.hiddenIds) !== JSON.stringify(before.hiddenIds)) {
      get().pushOp(viewStateOp(before, after));
    }
    set({ tagFilter: ids, tagFilterHiddenIds: nextTagHidden, hiddenIds: finalHidden, graphVersion: get().graphVersion + 1 });
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
