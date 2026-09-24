/**
 * Tag registry methods: setTags, createTag, updateTag, deleteTag.
 */
import { v4 as uuid } from "uuid";
import type { Tag } from "@/lib/fewer/tags";
import { TAG_PALETTE } from "@/lib/fewer/tags";
import type { FewerNode, HistoryOp } from "@/lib/fewer/types";
import type { GraphState } from "../types";
import { captureViewState, viewStateOp } from "../historySlice";
import { withTagIds, tagFilterHiddenNodeIds, mergeTagHiddenLayers } from "./shared";

/** Pick the next palette color by cycling through TAG_PALETTE. */
function nextColor(existing: Tag[]): string {
  return TAG_PALETTE[existing.length % TAG_PALETTE.length];
}

export function buildRegistryMethods(
  set: (partial: Partial<GraphState>) => void,
  get: () => GraphState,
) {
  return {
    setTags: (tags: Tag[]) => set({ tags }),

    createTag: (label: string, color?: string) => {
      const trimmed = label.trim() || "Untitled";
      const tag: Tag = {
        id: `tag-${uuid().slice(0, 8)}`,
        label: trimmed,
        color: color ?? nextColor(get().tags),
      };
      set({ tags: [...get().tags, tag] });
      return tag;
    },

    updateTag: (id: string, patch: Partial<Pick<Tag, "label" | "color">>) => {
      set({
        tags: get().tags.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      });
    },

    deleteTag: (id: string) => {
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
      const { nodes, changes } = withTagIds(
        state.nodes,
        (n) => n.data.tagIds?.includes(id) ?? false,
        (ids) => ids.filter((t) => t !== id),
      );
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
  };
}
