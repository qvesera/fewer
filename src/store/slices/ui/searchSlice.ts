"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "../types";
import type { FileCategory } from "@/lib/fewer/types";
import { categoryHiddenNodeIds } from "@/lib/fewer/categorize";
import { SEARCH_HISTORY_KEY, withSearchEntry } from "@/lib/fewer/searchHistory";
import { captureViewState, viewStateOp } from "../historySlice";

export type SearchSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    searchQuery: string;
    searchHistory: string[];
    /** Active file-type filters (OR semantics; empty = no filter). */
    categoryFilter: FileCategory[];
    /** Ids that the active category filter has added to hiddenIds. */
    categoryHiddenIds: string[];

    setSearchQuery: (q: string) => void;
    commitSearch: (q: string) => void;
    clearSearchHistory: () => void;
    setCategoryFilter: (cats: FileCategory[]) => void;
    toggleCategoryFilter: (cat: FileCategory) => void;
    clearCategoryFilter: () => void;
  }
>;

export const createSearchSlice: SearchSliceCreator = (set, get) => ({
  searchQuery: "",
  searchHistory: [] as string[],
  categoryFilter: [],
  categoryHiddenIds: [],

  setSearchQuery: (query) => { set({ searchQuery: query }); get().applySearch(); },
  commitSearch: (q) => {
    const next = withSearchEntry(get().searchHistory, q);
    set({ searchHistory: next });
    if (typeof window === "undefined") return;
    try { sessionStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  },
  clearSearchHistory: () => {
    set({ searchHistory: [] });
    if (typeof window === "undefined") return;
    try { sessionStorage.removeItem(SEARCH_HISTORY_KEY); } catch { /* ignore */ }
  },
  setCategoryFilter: (cats) => {
    const { nodes, hiddenIds, categoryHiddenIds } = get();
    const nextCatHidden = categoryHiddenNodeIds(nodes, cats);
    const prevCatSet = new Set(categoryHiddenIds);
    const baseHidden = hiddenIds.filter((id) => !prevCatSet.has(id));
    const finalHidden = [...new Set([...baseHidden, ...nextCatHidden])];
    const before = captureViewState(get());
    const after = { ...before, hiddenIds: finalHidden, categoryFilter: cats, categoryHiddenIds: nextCatHidden };
    if (JSON.stringify(after.hiddenIds) !== JSON.stringify(before.hiddenIds) || after.categoryFilter.length !== before.categoryFilter.length) {
      get().pushOp(viewStateOp(before, after));
    }
    set({ categoryFilter: cats, categoryHiddenIds: nextCatHidden, hiddenIds: finalHidden, graphVersion: get().graphVersion + 1 });
  },
  toggleCategoryFilter: (cat) => {
    const cur = get().categoryFilter;
    const next = cur.includes(cat) ? cur.filter((c) => c !== cat) : [...cur, cat];
    get().setCategoryFilter(next);
  },
  clearCategoryFilter: () => { get().setCategoryFilter([]); },
});
