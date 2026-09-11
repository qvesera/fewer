"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "../types";
import type { ViewSettings } from "@/lib/fewer/viewState";
import {
  saveLayoutToStorage,
  clearLayoutStorage,
  defaultLayout,
} from "@/lib/fewer/panelLayout";
import * as treeModule from "@/lib/fewer/panelTree";

export type PanelUiSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    showMiniMap: boolean;
    /** Per-leaf view settings overrides (showFiles, minimapHidden, edgeStyle, theme, etc.). */
    viewSettings: Record<string, ViewSettings>;
    miniMapPosition: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "custom";
    miniMapSize: number;
    /** Free-form x/y offset (px from top-left) used when miniMapPosition === "custom". */
    miniMapX: number;
    miniMapY: number;
    /** Default wheel behavior: "pan" scrolls the canvas vertically (Ctrl+wheel zooms), "zoom" zooms directly (Ctrl+wheel pans, trackpad pinch unaffected). */
    scrollAction: "pan" | "zoom";
    /** Live canvas (viewer) dimensions — guides minimap X/Y slider bounds. */
    canvasSize: { width: number; height: number };
    // ── Panel layout (Blender-style docked areas) ──
    sidebarSide: "left" | "right";
    panelTree: import("@/lib/fewer/panelTree").PanelNode;

    setShowMiniMap: (show: boolean) => void;
    toggleMinimapForLeaf: (leafId: string) => void;
    /** Set a per-view setting override. Bumps graphVersion for sync. */
    setViewSetting: (leafId: string, key: keyof ViewSettings, value: unknown) => void;
    updateViewSettings: (leafId: string, patch: Partial<ViewSettings>) => void;
    setNodePositionForLeaf: (leafId: string, nodeId: string, pos: { x: number; y: number }) => void;
    /** Batch write per-view positions without graphVersion bump (for during-drag). */
    setNodePositionsBatch: (leafId: string, entries: { id: string; pos: { x: number; y: number } }[]) => void;
    /** Seed the full positions map for a view (first drag writes full map before drag delta). */
    seedNodePositions: (leafId: string, fullMap: Record<string, { x: number; y: number }>) => void;
    clearViewPositions: (leafId: string) => void;
    setMiniMapPosition: (pos: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "custom") => void;
    setMiniMapSize: (size: number) => void;
    setMiniMapX: (x: number) => void;
    setMiniMapY: (y: number) => void;
    setScrollAction: (action: "pan" | "zoom") => void;
    setCanvasSize: (size: { width: number; height: number }) => void;

    setSidebarSide: (side: "left" | "right") => void;
    setPanelTree: (tree: import("@/lib/fewer/panelTree").PanelNode) => void;
    splitArea: (id: string, dir: "h" | "v", ratio?: number) => void;
    joinArea: (id: string) => void;
    setAreaEditor: (id: string, editor: import("@/lib/fewer/panelLayout").AreaEditor) => void;
    insertAreaAtEdge: (side: "left" | "right", editor: import("@/lib/fewer/panelLayout").AreaEditor) => void;
    setDividerRatio: (firstId: string, secondId: string, ratio: number) => void;
    resetPanelLayout: () => void;
    /** @internal — writes layout to localStorage. Called by other panel actions. */
    _persistLayout: () => void;
  }
>;

export const createPanelUiSlice: PanelUiSliceCreator = (set, get) => ({
  showMiniMap: true,
  viewSettings: {},
  miniMapPosition: "bottom-right",
  miniMapSize: 160,
  miniMapX: 16,
  miniMapY: 16,
  scrollAction: "pan",
  canvasSize: { width: 0, height: 0 },

  // Panel layout defaults — always start with server-safe defaults.
  // Stored layout hydrates in a useEffect to avoid hydration mismatch.
  ...(() => {
    const layout = defaultLayout();
    return { sidebarSide: layout.sidebarSide, panelTree: layout.panelTree };
  })(),

  setShowMiniMap: (show) => set({ showMiniMap: show }),
  toggleMinimapForLeaf: (leafId) => {
    const s = get();
    const leaf = s.viewSettings[leafId] ?? {};
    const next = { ...s.viewSettings, [leafId]: { ...leaf, minimapHidden: !leaf.minimapHidden } };
    set({ viewSettings: next });
    get()._persistLayout();
  },

  setViewSetting: (leafId, key, value) => {
    const s = get();
    const leaf = s.viewSettings[leafId] ?? {};
    const next = { ...s.viewSettings, [leafId]: { ...leaf, [key]: value } };
    set({ viewSettings: next, graphVersion: s.graphVersion + 1 });
    get()._persistLayout();
  },

  updateViewSettings: (leafId, patch) => {
    const s = get();
    const leaf = s.viewSettings[leafId] ?? {};
    // When direction changes, clear positions so the view re-derives
    const next: Record<string, unknown> = { ...leaf, ...patch };
    if (patch.direction !== undefined && patch.direction !== (leaf as Record<string, unknown>).direction) {
      next.positions = undefined;
    }
    const viewNext = { ...s.viewSettings, [leafId]: next };
    set({ viewSettings: viewNext, graphVersion: s.graphVersion + 1 });
    get()._persistLayout();
  },

  setNodePositionForLeaf: (leafId, nodeId, pos) => set((s) => {
    const leaf = s.viewSettings[leafId] ?? {};
    const positions = { ...(leaf.positions ?? {}), [nodeId]: pos };
    const next = { ...s.viewSettings, [leafId]: { ...leaf, positions } };
    return { viewSettings: next, graphVersion: s.graphVersion + 1 };
  }),

  setNodePositionsBatch: (leafId, entries) => set((s) => {
    const leaf = s.viewSettings[leafId] ?? {};
    const positions = { ...(leaf.positions ?? {}) };
    for (const { id, pos } of entries) positions[id] = pos;
    const next = { ...s.viewSettings, [leafId]: { ...leaf, positions } };
    return { viewSettings: next }; // No graphVersion bump — RF already shows positions
  }),

  seedNodePositions: (leafId, fullMap) => set((s) => {
    const leaf = s.viewSettings[leafId] ?? {};
    if (leaf.positions) return {}; // Already seeded — no-op
    const next = { ...s.viewSettings, [leafId]: { ...leaf, positions: { ...fullMap } } };
    return { viewSettings: next }; // Silent — no bump
  }),

  clearViewPositions: (leafId) => {
    const s = get();
    const leaf = s.viewSettings[leafId];
    if (!leaf?.positions) return;
    const next = { ...s.viewSettings, [leafId]: { ...leaf, positions: undefined } };
    set({ viewSettings: next, graphVersion: s.graphVersion + 1 });
  },
  setMiniMapPosition: (pos) => set({ miniMapPosition: pos }),
  setMiniMapSize: (size) => set({ miniMapSize: size }),
  setMiniMapX: (x) => set({ miniMapX: x }),
  setMiniMapY: (y) => set({ miniMapY: y }),
  setScrollAction: (action) => set({ scrollAction: action }),
  setCanvasSize: (size) => set({ canvasSize: size }),

  // ── Panel layout actions ──

  _persistLayout: () => {
    const s = get();
    saveLayoutToStorage({ sidebarSide: s.sidebarSide, panelTree: s.panelTree, viewSettings: s.viewSettings });
  },

  setSidebarSide: (side) => {
    set({ sidebarSide: side });
    get()._persistLayout();
  },

  setPanelTree: (tree) => {
    set({ panelTree: tree });
    get()._persistLayout();
  },

  splitArea: (id, dir, ratio) => {
    const tree = get().panelTree;
    const newTree = treeModule.splitLeaf(tree, id, dir, ratio);
    if (newTree !== tree) {
      set({ panelTree: newTree });
      get()._persistLayout();
    }
  },

  joinArea: (id) => {
    const tree = get().panelTree;
    const newTree = treeModule.joinLeaf(tree, id);
    if (newTree !== tree) {
      set({ panelTree: newTree });
      get()._persistLayout();
    }
  },

  setAreaEditor: (id, editor) => {
    const tree = get().panelTree;
    const newTree = treeModule.setLeafEditor(tree, id, editor);
    if (newTree !== tree) {
      set({ panelTree: newTree });
      get()._persistLayout();
    }
  },

  insertAreaAtEdge: (side, editor) => {
    const tree = get().panelTree;
    const newTree = treeModule.insertLeafAtEdge(tree, side, editor);
    set({ panelTree: newTree });
    get()._persistLayout();
  },

  setDividerRatio: (firstId, secondId, ratio) => {
    const tree = get().panelTree;
    const newTree = treeModule.setDividerRatio(tree, firstId, secondId, ratio);
    if (newTree !== tree) {
      set({ panelTree: newTree });
      get()._persistLayout();
    }
  },

  resetPanelLayout: () => {
    const d = defaultLayout();
    set({ sidebarSide: d.sidebarSide, panelTree: d.panelTree });
    clearLayoutStorage();
  },
});
