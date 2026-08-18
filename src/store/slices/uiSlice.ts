"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "./types";
import type { ExportSettings } from "@/lib/fewer/types";
import type { FileCategory } from "@/lib/fewer/types";
import type { ImportOptions } from "@/lib/fewer/importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "@/lib/fewer/importOptions";
import { categoryHiddenNodeIds } from "@/lib/fewer/categorize";
import { TUTORIAL_STORAGE_KEY, TUTORIAL_BEGINNER_DONE_KEY } from "@/lib/fewer/tutorial";
import { captureViewState, viewStateOp } from "./historySlice";

export type UiSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    selectedNodeIds: string[];
    searchQuery: string;
    /** Active file-type (extension category) filter. `null` = no filter. */
    categoryFilter: FileCategory | null;
    /** Ids that the active category filter has added to hiddenIds. */
    categoryHiddenIds: string[];
    hiddenIds: string[];
    renamingId: string | null;
    renameSource: "canvas" | "folder" | null;
    zoomToNode: { nodeId: string; timestamp: number } | null;
    zoomToNodeIds: string[] | null;
    mousePosition: { x: number; y: number } | null;
    pastePosition: { x: number; y: number } | null;
    focusedNodeId: string | null;
    searchOpen: boolean;
    exportOpen: boolean;
    sidebarOpen: boolean;
    advancedOpen: boolean;
    themeEditorOpen: boolean;
    bugReportOpen: boolean;
    shortcutsOpen: boolean;
    settingsOpen: boolean;
    shareOpen: boolean;
    authOpen: boolean;
    showMiniMap: boolean;
    miniMapPosition: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "custom";
    miniMapSize: number;
    /** Free-form x/y offset (px from top-left) used when miniMapPosition === "custom". */
    miniMapX: number;
    miniMapY: number;
    advancedModeEnabled: boolean;
    skipNextAutoLayout: boolean;
    showFiles: boolean;
    loading: boolean;
    exportSettings: ExportSettings;
    importOptions: ImportOptions;
    tutorialBeginnerDone: string[];
    tutorialDismissed: boolean;
    tutorialDemoStep: number;
    rightClickDetected: boolean;

    setSearchQuery: (q: string) => void;
    setCategoryFilter: (cat: FileCategory | null) => void;
    setSelectedNodeIds: (ids: string[]) => void;
    setRenamingId: (id: string | null, source?: "canvas" | "folder") => void;
    setZoomToNode: (nodeId: string | null) => void;
    setZoomToNodeIds: (ids: string[] | null) => void;
    setMousePosition: (pos: { x: number; y: number } | null) => void;
    setPastePosition: (pos: { x: number; y: number } | null) => void;
    setFocusedNodeId: (id: string | null) => void;
    setHiddenIds: (ids: string[]) => void;
    toggleHidden: (id: string) => void;
    hideSelected: () => void;
    showAll: () => void;
    setSearchOpen: (open: boolean) => void;
    setExportOpen: (open: boolean) => void;
    setSidebarOpen: (open: boolean) => void;
    setAdvancedOpen: (open: boolean) => void;
    setThemeEditorOpen: (open: boolean) => void;
    setBugReportOpen: (open: boolean) => void;
    setShortcutsOpen: (open: boolean) => void;
    setSettingsOpen: (open: boolean) => void;
    setShareOpen: (open: boolean) => void;
    setAuthOpen: (open: boolean) => void;
    setShowMiniMap: (show: boolean) => void;
    setMiniMapPosition: (pos: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "custom") => void;
    setMiniMapSize: (size: number) => void;
    setMiniMapX: (x: number) => void;
    setMiniMapY: (y: number) => void;
    /** Live canvas (viewer) dimensions — guides minimap X/Y slider bounds. */
    canvasSize: { width: number; height: number };
    setCanvasSize: (size: { width: number; height: number }) => void;
    setShowFiles: (show: boolean) => void;
    setLoading: (loading: boolean) => void;
    setExportSettings: (settings: Partial<ExportSettings>) => void;
    setImportOptions: (options: ImportOptions) => void;
    markTutorialBeginnerStep: (id: string) => void;
    unmarkTutorialBeginnerStep: (id: string) => void;
    setTutorialDismissed: () => void;
    setTutorialDemoStep: (step: number) => void;
    setRightClickDetected: () => void;
    resetTutorial: () => void;
  }
>;

export const createUiSlice: UiSliceCreator = (set, get) => ({
  selectedNodeIds: [],
  searchQuery: "",
  categoryFilter: null,
  categoryHiddenIds: [],
  hiddenIds: [],
  renamingId: null,
  renameSource: null,
  zoomToNode: null,
  zoomToNodeIds: null,
  mousePosition: null,
  pastePosition: null,
  focusedNodeId: null,
  searchOpen: false,
  exportOpen: false,
  sidebarOpen: true,
  advancedOpen: false,
  themeEditorOpen: false,
  bugReportOpen: false,
  shortcutsOpen: false,
  settingsOpen: false,
  shareOpen: false,
  authOpen: false,
  showMiniMap: true,
  miniMapPosition: "bottom-right",
  miniMapSize: 160,
  miniMapX: 16,
  miniMapY: 16,
  advancedModeEnabled: false,
  showFiles: true,
  loading: false,
  exportSettings: { format: "svg", quality: 90, transparentBackground: false, includeStats: true, includeBranding: true },
  importOptions: { ...DEFAULT_IMPORT_OPTIONS },

  tutorialBeginnerDone: (() => {
    if (typeof window === "undefined") return [];
    try { const v = localStorage.getItem(TUTORIAL_BEGINNER_DONE_KEY); return v ? JSON.parse(v) : []; } catch { return []; }
  })(),
  tutorialDismissed: (() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem(TUTORIAL_STORAGE_KEY) === "true"; } catch { return false; }
  })(),
  tutorialDemoStep: 0,
  rightClickDetected: false,
  skipNextAutoLayout: false,

  setSearchQuery: (query) => { set({ searchQuery: query }); get().applySearch(); },
  setCategoryFilter: (cat) => {
    const { nodes, hiddenIds, categoryHiddenIds } = get();
    // Files to hide for this filter (folders are never hidden).
    const nextCatHidden = categoryHiddenNodeIds(nodes, cat);
    const prevCatSet = new Set(categoryHiddenIds);
    // Drop the ids the previous filter hid, then add the ids this one hides.
    // Manual hides are preserved because only the tracked category-hidden ids are touched.
    const baseHidden = hiddenIds.filter((id) => !prevCatSet.has(id));
    const finalHidden = [...new Set([...baseHidden, ...nextCatHidden])];
    const before = captureViewState(get());
    const after = { ...before, hiddenIds: finalHidden, categoryFilter: cat, categoryHiddenIds: nextCatHidden };
    if (JSON.stringify(after.hiddenIds) !== JSON.stringify(before.hiddenIds) || after.categoryFilter !== before.categoryFilter) {
      get().pushOp(viewStateOp(before, after));
    }
    set({ categoryFilter: cat, categoryHiddenIds: nextCatHidden, hiddenIds: finalHidden, graphVersion: get().graphVersion + 1 });
    setTimeout(() => get().relayout(), 50);
  },
  setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),
  setHiddenIds: (ids) => set({ hiddenIds: ids }),

  setRenamingId: (id, source) => {
    if (id) {
      const { hiddenIds, edges } = get();
      if (hiddenIds.includes(id)) {
        const parentEdge = edges.find((e) => e.target === id);
        if (parentEdge) { set({ renamingId: id, renameSource: source ?? "canvas", zoomToNode: { nodeId: parentEdge.source, timestamp: Date.now() } }); return; }
      }
    }
    set({ renamingId: id, renameSource: id ? (source ?? "canvas") : null, zoomToNode: id ? { nodeId: id, timestamp: Date.now() } : null });
  },

  setZoomToNode: (nodeId) => set({ zoomToNode: nodeId ? { nodeId, timestamp: Date.now() } : null }),
  setZoomToNodeIds: (ids) => set({ zoomToNodeIds: ids }),
  setMousePosition: (pos) => set({ mousePosition: pos }),
  setPastePosition: (pos) => set({ pastePosition: pos }),
  setFocusedNodeId: (id) => set({ focusedNodeId: id }),

  toggleHidden: (id) => {
    const before = captureViewState(get());
    const { hiddenIds } = get();
    const next = hiddenIds.includes(id)
      ? hiddenIds.filter((h) => h !== id)
      : [...hiddenIds, id];
    const after = { ...before, hiddenIds: next };
    if (before.hiddenIds.join(",") !== after.hiddenIds.join(",")) get().pushOp(viewStateOp(before, after));
    set((s) => ({
      hiddenIds: next,
      autoHiddenIds: hiddenIds.includes(id) ? s.autoHiddenIds.filter((h) => h !== id) : s.autoHiddenIds,
    }));
  },

  hideSelected: () => {
    const { selectedNodeIds, edges, graphVersion } = get();
    if (selectedNodeIds.length === 0) return;
    const toHide = new Set(selectedNodeIds);
    for (const id of selectedNodeIds) {
      const queue = [id];
      while (queue.length) {
        const nid = queue.shift()!;
        for (const e of edges) { if (e.source === nid && !toHide.has(e.target)) { toHide.add(e.target); queue.push(e.target); } }
      }
    }
    const before = captureViewState(get());
    const after = { ...before, hiddenIds: [...before.hiddenIds, ...toHide] as string[] };
    get().pushOp(viewStateOp(before, after));
    set((s) => ({ hiddenIds: [...s.hiddenIds, ...toHide], autoHiddenIds: s.autoHiddenIds.filter((h) => !toHide.has(h)), selectedNodeIds: [], graphVersion: graphVersion + 1 }));
    setTimeout(() => get().relayout(), 50);
  },

  showAll: () => {
    const before = captureViewState(get());
    if (before.hiddenIds.length === 0 && !before.categoryFilter) return;
    const after = { ...before, hiddenIds: [], categoryFilter: null, categoryHiddenIds: [] };
    get().pushOp(viewStateOp(before, after));
    set((s) => ({ hiddenIds: [], autoHiddenIds: [], revealedRootIds: [], categoryFilter: null, categoryHiddenIds: [], graphVersion: s.graphVersion + 1 }));
  },

  setSearchOpen: (open) => set({ searchOpen: open }),
  setExportOpen: (open) => set({ exportOpen: open }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setAdvancedOpen: (open) => set({ advancedOpen: open }),
  setThemeEditorOpen: (open) => set({ themeEditorOpen: open }),
  setBugReportOpen: (open) => set({ bugReportOpen: open }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setShareOpen: (open) => set({ shareOpen: open }),
  setAuthOpen: (open) => set({ authOpen: open }),
  setShowMiniMap: (show) => set({ showMiniMap: show }),
  setMiniMapPosition: (pos) => set({ miniMapPosition: pos }),
  setMiniMapSize: (size) => set({ miniMapSize: size }),
  setMiniMapX: (x) => set({ miniMapX: x }),
  setMiniMapY: (y) => set({ miniMapY: y }),
  canvasSize: { width: 0, height: 0 },
  setCanvasSize: (size) => set({ canvasSize: size }),
  setLoading: (loading) => set({ loading }),

  setShowFiles: (show) => {
    const { nodes, edges, graphVersion, categoryFilter } = get();
    const before = captureViewState(get());
    const fileIds = nodes.filter((n) => n.data.type === "file").map((n) => n.id);
    if (show) {
      // Only reveal files whose parent folder is NOT hidden.
      // Files under hidden folders must remain hidden to avoid orphan rendering.
      const parentMap = new Map<string, string>();
      for (const e of edges) parentMap.set(e.target, e.source);
      const hiddenSet = new Set(before.hiddenIds);
      const revealableFileIds = fileIds.filter((fid) => {
        const parentId = parentMap.get(fid);
        return !parentId || !hiddenSet.has(parentId);
      });
      // A category filter keeps non-matching files hidden even when "show files" reveals the rest.
      const revealable = categoryFilter
        ? revealableFileIds.filter((id) => {
            const node = nodes.find((n) => n.id === id);
            return node?.data.type === "folder" || node?.data.category === categoryFilter;
          })
        : revealableFileIds;
      const after = { ...before, showFiles: true, hiddenIds: before.hiddenIds.filter((id) => !revealable.includes(id)) };
      if (JSON.stringify(after) !== JSON.stringify(before)) get().pushOp(viewStateOp(before, after));
      set((s) => ({ showFiles: true, hiddenIds: s.hiddenIds.filter((id) => !revealable.includes(id)), graphVersion: graphVersion + 1 }));
    } else {
      const after = { ...before, showFiles: false, hiddenIds: [...new Set([...before.hiddenIds, ...fileIds])] };
      if (JSON.stringify(after) !== JSON.stringify(before)) get().pushOp(viewStateOp(before, after));
      set((s) => ({ showFiles: false, hiddenIds: [...new Set([...s.hiddenIds, ...fileIds])], graphVersion: graphVersion + 1 }));
    }
    setTimeout(() => get().relayout(), 50);
  },

  setExportSettings: (settings) => set((s) => ({ exportSettings: { ...s.exportSettings, ...settings } })),
  setImportOptions: (options) => set({ importOptions: options }),

  markTutorialBeginnerStep: (id) => {
    const done = get().tutorialBeginnerDone;
    if (done.includes(id)) return;
    const next = [...done, id];
    set({ tutorialBeginnerDone: next });
    if (typeof window !== "undefined") { try { localStorage.setItem(TUTORIAL_BEGINNER_DONE_KEY, JSON.stringify(next)); } catch { /* ignore */ } }
  },
  unmarkTutorialBeginnerStep: (id) => {
    const done = get().tutorialBeginnerDone;
    if (!done.includes(id)) return;
    const next = done.filter((d) => d !== id);
    set({ tutorialBeginnerDone: next });
    if (typeof window !== "undefined") { try { localStorage.setItem(TUTORIAL_BEGINNER_DONE_KEY, JSON.stringify(next)); } catch { /* ignore */ } }
  },
  setTutorialDismissed: () => {
    set({ tutorialDismissed: true });
    if (typeof window !== "undefined") { try { localStorage.setItem(TUTORIAL_STORAGE_KEY, "true"); } catch { /* ignore */ } }
  },
  setTutorialDemoStep: (step) => set({ tutorialDemoStep: step }),
  setRightClickDetected: () => set({ rightClickDetected: true }),
  resetTutorial: () => {
    set({ tutorialBeginnerDone: [], tutorialDismissed: false, tutorialDemoStep: 0, rightClickDetected: false });
    if (typeof window !== "undefined") {
      try { localStorage.removeItem(TUTORIAL_STORAGE_KEY); localStorage.removeItem(TUTORIAL_BEGINNER_DONE_KEY); } catch { /* ignore */ }
    }
  },
});