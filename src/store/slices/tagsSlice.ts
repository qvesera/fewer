"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "./types";
import type { FewerNode } from "@/lib/fewer/types";
import { v4 as uuid } from "uuid";
import type { Tag } from "@/lib/fewer/tags";
import { TAG_PALETTE } from "@/lib/fewer/tags";

export type TagsSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    /** Tag registry (id → Tag). Travels with the graph via snapshot. */
    tags: Tag[];
    /** Active tag-filter ids (OR semantics). Empty = no filter. */
    tagFilter: string[];

    setTags: (tags: Tag[]) => void;
    createTag: (label: string, color?: string) => Tag;
    updateTag: (id: string, patch: Partial<Pick<Tag, "label" | "color">>) => void;
    deleteTag: (id: string) => void;
    assignTag: (nodeId: string, tagId: string) => void;
    unassignTag: (nodeId: string, tagId: string) => void;
    toggleNodeTag: (nodeId: string, tagId: string) => void;
    setTagFilter: (ids: string[]) => void;
    toggleTagFilter: (id: string) => void;
    clearTagFilter: () => void;
  }
>;

/** Pick the next palette color by cycling through TAG_PALETTE. */
function nextColor(existing: Tag[]): string {
  return TAG_PALETTE[existing.length % TAG_PALETTE.length];
}

export const createTagsSlice: TagsSliceCreator = (set, get) => ({
  tags: [],
  tagFilter: [],

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
    set({
      tags: tags.filter((t) => t.id !== id),
      tagFilter: tagFilter.filter((t) => t !== id),
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

  setTagFilter: (ids) => set({ tagFilter: ids }),

  toggleTagFilter: (id) => {
    const cur = get().tagFilter;
    set({ tagFilter: cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id] });
  },

  clearTagFilter: () => set({ tagFilter: [] }),
});
