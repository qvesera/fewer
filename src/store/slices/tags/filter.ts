/**
 * Tag filter methods: setTagFilter, toggleTagFilter, clearTagFilter.
 */
import type { GraphState } from "../types";
import { captureViewState, viewStateOp } from "../historySlice";
import { tagFilterHiddenNodeIds, mergeTagHiddenLayers } from "./shared";

export function buildFilterMethods(
  set: (partial: Partial<GraphState>) => void,
  get: () => GraphState,
) {
  return {
    setTagFilter: (ids: string[]) => {
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

    toggleTagFilter: (id: string) => {
      const cur = get().tagFilter;
      const next = cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id];
      get().setTagFilter(next);
    },

    clearTagFilter: () => {
      get().setTagFilter([]);
    },
  };
}
