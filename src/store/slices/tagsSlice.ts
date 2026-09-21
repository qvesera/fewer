"use client";
import type { Tag } from "@/lib/fewer/tags";
import type { StateCreator } from "zustand";
import type { GraphState } from "./types";

// Re-export shared helpers so existing importers (tagsSlice.test.ts, etc.) keep working.
export { mergeTagHiddenLayers } from "./tags/shared";

export type TagsSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    tags: Tag[];
    tagFilter: string[];
    tagFilterHiddenIds: string[];
    setTags: (tags: Tag[]) => void;
    createTag: (label: string, color?: string) => Tag;
    updateTag: (id: string, patch: Partial<Pick<Tag, "label" | "color">>) => void;
    deleteTag: (id: string) => void;
    assignTag: (nodeId: string, tagId: string) => void;
    unassignTag: (nodeId: string, tagId: string) => void;
    toggleNodeTag: (nodeId: string, tagId: string) => void;
    assignTagToNodes: (nodeIds: string[], tagId: string) => void;
    unassignTagFromNodes: (nodeIds: string[], tagId: string) => void;
    setTagFilter: (ids: string[]) => void;
    toggleTagFilter: (id: string) => void;
    clearTagFilter: () => void;
  }
>;

import { buildRegistryMethods } from "./tags/registry";
import { buildAssignmentMethods } from "./tags/assignment";
import { buildFilterMethods } from "./tags/filter";

export const createTagsSlice: TagsSliceCreator = (set, get) => ({
  tags: [],
  tagFilter: [],
  tagFilterHiddenIds: [],
  ...buildRegistryMethods(set, get),
  ...buildAssignmentMethods(set, get),
  ...buildFilterMethods(set, get),
});
