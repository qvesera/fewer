"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "./types";
import type { ExportSettings } from "@/lib/fewer/types";
import { TUTORIAL_STORAGE_KEY, TUTORIAL_BEGINNER_DONE_KEY } from "@/lib/fewer/tutorial";

export type UiSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    selectedNodeIds: string[];
    searchQuery: string;
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
    showMiniMap: boolean;
    miniMapPosition: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    miniMapSize: number;
    advancedModeEnabled: boolean;
    showFiles: boolean;
    loading: boolean;
    exportSettings: ExportSettings;
    tutorialBeginnerDone: string[];
    tutorialDismissed: boolean;
    tutorialDemoStep: number;
    rightClickDetected: boolean;

    setSearchQuery: (q: string) => void;
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
    setShowMiniMap: (show: boolean) => void;
    setMiniMapPosition: (pos: "top-left" | "top-right" | "bottom-left" | "bottom-right") => void;
    setMiniMapSize: (size: number) => void;
    setAdvancedMode: (enabled: boolean) => void;
    setShowFiles: (show: boolean) => void;
    setLoading: (loading: boolean) => void;
    setExportSettings: (settings: Partial<ExportSettings>) => void;
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
  showMiniMap: true,
  miniMapPosition: "bottom-right",
  miniMapSize: 160,
  advancedModeEnabled: false,
  showFiles: true,
  loading: false,
  exportSettings: { format: "svg", quality: 90, transparentBackground: false, includeStats: true },

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

  setSearchQuery: (query) => { set({ searchQuery: query }); get().applySearch(); },
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
    const { hiddenIds } = get();
    if (hiddenIds.includes(id)) set({ hiddenIds: hiddenIds.filter((h) => h !== id) });
    else set({ hiddenIds: [...hiddenIds, id] });
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
    set((s) => ({ hiddenIds: [...s.hiddenIds, ...toHide], selectedNodeIds: [], graphVersion: graphVersion + 1 }));
    setTimeout(() => get().relayout(), 50);
  },

  showAll: () => set({ hiddenIds: [] }),

  setSearchOpen: (open) => set({ searchOpen: open }),
  setExportOpen: (open) => set({ exportOpen: open }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setAdvancedOpen: (open) => set({ advancedOpen: open }),
  setThemeEditorOpen: (open) => set({ themeEditorOpen: open }),
  setBugReportOpen: (open) => set({ bugReportOpen: open }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setShareOpen: (open) => set({ shareOpen: open }),
  setShowMiniMap: (show) => set({ showMiniMap: show }),
  setMiniMapPosition: (pos) => set({ miniMapPosition: pos }),
  setMiniMapSize: (size) => set({ miniMapSize: size }),
  setLoading: (loading) => set({ loading }),

  setAdvancedMode: (enabled) => {
    set({ advancedModeEnabled: enabled });
    if (typeof window !== "undefined") localStorage.setItem("fewer-advanced-mode", String(enabled));
    // When disabling advanced mode, reset all settings to defaults
    if (!enabled) {
      // Reset theme to dark
      get().setThemeMode("dark");
      get().resetCustomTheme();
      set({
        // Layout defaults
        direction: "TB",
        edgeStyle: "curved",
        edgeAnimated: false,
        edgeStrokeStyle: "solid",
        edgeWidth: 2,
        cornerRadius: 8,
        // UI defaults
        showMiniMap: true,
        miniMapPosition: "bottom-right",
        miniMapSize: 160,
        showFiles: true,
        // Graph defaults
        maxDisplayDepth: 6,
        autoHideThreshold: 10,
      });
    }
  },

  setShowFiles: (show) => {
    const { nodes, edges, graphVersion } = get();
    const fileIds = nodes.filter((n) => n.data.type === "file").map((n) => n.id);
    if (show) {
      // Only reveal files whose parent folder is NOT hidden.
      // Files under hidden folders must remain hidden to avoid orphan rendering.
      const parentMap = new Map<string, string>();
      for (const e of edges) parentMap.set(e.target, e.source);
      const hiddenSet = new Set(get().hiddenIds);
      const revealableFileIds = fileIds.filter((fid) => {
        const parentId = parentMap.get(fid);
        return !parentId || !hiddenSet.has(parentId);
      });
      set((s) => ({ showFiles: true, hiddenIds: s.hiddenIds.filter((id) => !revealableFileIds.includes(id)), graphVersion: graphVersion + 1 }));
    } else {
      set((s) => ({ showFiles: false, hiddenIds: [...new Set([...s.hiddenIds, ...fileIds])], graphVersion: graphVersion + 1 }));
    }
    setTimeout(() => get().relayout(), 50);
  },

  setExportSettings: (settings) => set((s) => ({ exportSettings: { ...s.exportSettings, ...settings } })),

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