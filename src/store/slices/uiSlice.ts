"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "./types";
import type { ExportSettings } from "@/lib/fewer/types";
import type { FileCategory } from "@/lib/fewer/types";
import type { ImportOptions } from "@/lib/fewer/importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "@/lib/fewer/importOptions";
import { categoryHiddenNodeIds } from "@/lib/fewer/categorize";
import { SEARCH_HISTORY_KEY, withSearchEntry } from "@/lib/fewer/searchHistory";
import { TUTORIAL_STORAGE_KEY, TUTORIAL_BEGINNER_DONE_KEY } from "@/lib/fewer/tutorial";
import { captureViewState, viewStateOp } from "./historySlice";
import { reconcileAutoHide } from "./graphSlice";
import {
  loadLayoutFromStorage,
  saveLayoutToStorage,
  clearLayoutStorage,
  defaultLayout,
} from "@/lib/fewer/panelLayout";
import * as treeModule from "@/lib/fewer/panelTree";
import { resolveViewSettings, type ViewSettings } from "@/lib/fewer/viewState";

export type UiSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    selectedNodeIds: string[];
    /** Per-leaf selection storage. Key = leafId. */
    leafSelections: Record<string, string[]>;
    /** ID of the most recently interacted graph leaf (for keyboard shortcuts). */
    activeLeafId: string | null;
    searchQuery: string;
    searchHistory: string[];
    /** Active file-type (extension category) filter. `null` = no filter. */
    categoryFilter: FileCategory | null;
    /** Ids that the active category filter has added to hiddenIds. */
    categoryHiddenIds: string[];
    /** Transient ids to ring on the canvas while a sidebar (Hidden panel) row is hovered.
     *  Deliberately separate from data.highlighted so hover never pollutes node data,
     *  history snapshots, or search highlighting. */
    hoverHighlightIds: string[];
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
    /** Per-leaf view settings overrides (showFiles, minimapHidden, edgeStyle, theme, etc.). */
    viewSettings: Record<string, import("@/lib/fewer/viewState").ViewSettings>;
    miniMapPosition: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "custom";
    miniMapSize: number;
    /** Free-form x/y offset (px from top-left) used when miniMapPosition === "custom". */
    miniMapX: number;
    miniMapY: number;
    /** Default wheel behavior: "pan" scrolls the canvas vertically (Ctrl+wheel zooms), "zoom" zooms directly (Ctrl+wheel pans, trackpad pinch unaffected). */
    scrollAction: "pan" | "zoom";
    advancedModeEnabled: boolean;
    showFiles: boolean;
    loading: boolean;
    exportSettings: ExportSettings;
    importOptions: ImportOptions;
    tutorialBeginnerDone: string[];
    tutorialDismissed: boolean;
    tutorialDemoStep: number;
    rightClickDetected: boolean;

    // ── Panel layout (Blender-style docked areas) ──
    sidebarSide: "left" | "right";
    panelTree: import("@/lib/fewer/panelTree").PanelNode;

    setSearchQuery: (q: string) => void;
    commitSearch: (q: string) => void;
    clearSearchHistory: () => void;
    setCategoryFilter: (cat: FileCategory | null) => void;
    setSelectedNodeIds: (ids: string[]) => void;
    setSelectionForLeaf: (leafId: string, ids: string[]) => void;
    setActiveLeaf: (leafId: string | null) => void;
    /** Ring a transient set of node ids on the canvas (sidebar row hover). */
    setHoverHighlight: (ids: string[]) => void;
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
    toggleMinimapForLeaf: (leafId: string) => void;
    /** Set a per-view setting override. Bumps graphVersion for sync. */
    setViewSetting: (leafId: string, key: keyof import("@/lib/fewer/viewState").ViewSettings, value: unknown) => void;
    updateViewSettings: (leafId: string, patch: Partial<import("@/lib/fewer/viewState").ViewSettings>) => void;
    setNodePositionForLeaf: (leafId: string, nodeId: string, pos: { x: number; y: number }) => void;
    /** Batch write per-view positions without graphVersion bump (for during-drag). */
    setNodePositionsBatch: (leafId: string, entries: { id: string; pos: { x: number; y: number } }[]) => void;
    /** Seed the full positions map for a view (first drag writes full map before drag delta). */
    seedNodePositions: (leafId: string, fullMap: Record<string, { x: number; y: number }>) => void;
    /** Seed-on-write: first call captures effective hidden, then adds to individual layer. */
    hideForLeaf: (leafId: string, ids: string[]) => void;
    /** Eye-reveal: removes id from individual + subtrees + adds to filesBulkExempt. */
    eyeRevealForLeaf: (leafId: string, id: string) => void;
    /** Per-folder Hide Children. */
    hideSubtreeForLeaf: (leafId: string, folderId: string, descendantIds: string[]) => void;
    /** Per-folder Show Children. */
    showSubtreeForLeaf: (leafId: string, folderId: string) => void;
    /** Toggle "Hide Files" bulk layer. */
    setFilesBulkForLeaf: (leafId: string, active: boolean) => void;
    /** Clear all hide layers for this view (Reveal All). */
    revealAllForLeaf: (leafId: string) => void;
    /** Alias for hideForLeaf used by keyboard hide routing. */
    hideNodesForLeaf: (leafId: string, ids: string[]) => void;
    clearViewPositions: (leafId: string) => void;
    setMiniMapPosition: (pos: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "custom") => void;
    setMiniMapSize: (size: number) => void;
    setMiniMapX: (x: number) => void;
    setMiniMapY: (y: number) => void;
    setScrollAction: (action: "pan" | "zoom") => void;
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

export const createUiSlice: UiSliceCreator = (set, get) => ({
  selectedNodeIds: [],
  leafSelections: {},
  activeLeafId: null,
  searchQuery: "",
  searchHistory: (() => {
    if (typeof window === "undefined") return [];
    try {
      const v = sessionStorage.getItem(SEARCH_HISTORY_KEY);
      return v ? (JSON.parse(v) as string[]) : [];
    } catch {
      return [];
    }
  })(),
  categoryFilter: null,
  categoryHiddenIds: [],
  hoverHighlightIds: [],
  hiddenIds: [],
  independentlyHiddenIds: [],
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
  viewSettings: {},
  miniMapPosition: "bottom-right",
  miniMapSize: 160,
  miniMapX: 16,
  miniMapY: 16,
  scrollAction: "pan",
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

  // Panel layout defaults — loaded from localStorage once, saved on change.
  ...(() => {
    const stored = loadLayoutFromStorage();
    const layout = stored ?? defaultLayout();
    return { sidebarSide: layout.sidebarSide, panelTree: layout.panelTree };
  })(),

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
  },
  // Keep the per-node `selected` mirror in sync with the canonical id list.
  // React Flow-driven selection changes (which #setSelectedNodeIds) don't flow
  // back into the store through onNodesChange, so a stale `selected: true`
  // flag used to resurrect the selection on the next node rebuild (cut, copy,
  // paste, delete edge, hide, …). Mirroring the flags here means the store is
  // always self-consistent regardless of which rebuild path runs.
  setSelectedNodeIds: (ids) =>
    set((s) => {
      const idSet = new Set(ids);
      const changed = s.nodes.some((n) => idSet.has(n.id) !== !!n.selected);
      // Mirror into active leaf's selection so per-view sync picks it up
      const patch: Record<string, unknown> = { selectedNodeIds: ids };
      if (s.activeLeafId) {
        patch.leafSelections = { ...s.leafSelections, [s.activeLeafId]: ids };
      }
      return changed
        ? { ...patch, nodes: s.nodes.map((n) => (idSet.has(n.id) ? { ...n, selected: true } : { ...n, selected: false })), graphVersion: s.graphVersion + 1 }
        : { ...patch, graphVersion: s.graphVersion + 1 };
    }),
  setHoverHighlight: (ids) => set({ hoverHighlightIds: ids }),
  setHiddenIds: (ids) => set({ hiddenIds: ids }),

  setSelectionForLeaf: (leafId, ids) => set((s) => ({
    leafSelections: { ...s.leafSelections, [leafId]: ids },
    activeLeafId: leafId,
    selectedNodeIds: ids,
  })),

  setActiveLeaf: (leafId) => set((s) => {
    if (!leafId || leafId === s.activeLeafId) return {};
    const ids = s.leafSelections[leafId] ?? [];
    return { activeLeafId: leafId, selectedNodeIds: ids };
  }),

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
    const { hiddenIds, independentlyHiddenIds } = get();
    const hiding = !hiddenIds.includes(id);
    const next = hiding
      ? [...hiddenIds, id]
      : hiddenIds.filter((h) => h !== id);
    // User toggled this node directly — track it as independently hidden
    // so showSubtree won't auto-reveal it when a parent is shown.
    const nextIndie = hiding
      ? [...new Set([...independentlyHiddenIds, id])]
      : independentlyHiddenIds.filter((h) => h !== id);
    const after = { ...before, hiddenIds: next, independentlyHiddenIds: nextIndie };
    if (before.hiddenIds.join(",") !== after.hiddenIds.join(",")
        || before.independentlyHiddenIds.join(",") !== after.independentlyHiddenIds.join(",")) {
      get().pushOp(viewStateOp(before, after));
    }
    set((s) => ({
      hiddenIds: next,
      independentlyHiddenIds: nextIndie,
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
    set((s) => ({ hiddenIds: [...s.hiddenIds, ...toHide], independentlyHiddenIds: [...new Set([...s.independentlyHiddenIds, ...selectedNodeIds])], autoHiddenIds: s.autoHiddenIds.filter((h) => !toHide.has(h)), selectedNodeIds: [], graphVersion: graphVersion + 1 }));
  },

  showAll: () => {
    const before = captureViewState(get());
    if (before.hiddenIds.length === 0 && !before.categoryFilter) return;
    const after = { ...before, hiddenIds: [], categoryFilter: null, categoryHiddenIds: [] };
    get().pushOp(viewStateOp(before, after));
    set((s) => ({ hiddenIds: [], independentlyHiddenIds: [], autoHiddenIds: [], revealedRootIds: [], categoryFilter: null, categoryHiddenIds: [], graphVersion: s.graphVersion + 1 }));
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
  toggleMinimapForLeaf: (leafId) => set((s) => {
    const leaf = s.viewSettings[leafId] ?? {};
    const next = { ...s.viewSettings, [leafId]: { ...leaf, minimapHidden: !leaf.minimapHidden } };
    return { viewSettings: next };
  }),

  setViewSetting: (leafId, key, value) => set((s) => {
    const leaf = s.viewSettings[leafId] ?? {};
    const next = { ...s.viewSettings, [leafId]: { ...leaf, [key]: value } };
    return { viewSettings: next, graphVersion: s.graphVersion + 1 };
  }),

  updateViewSettings: (leafId, patch) => set((s) => {
    const leaf = s.viewSettings[leafId] ?? {};
    // When direction changes, clear positions so the view re-derives
    const next: Record<string, unknown> = { ...leaf, ...patch };
    if (patch.direction !== undefined && patch.direction !== (leaf as Record<string, unknown>).direction) {
      next.positions = undefined;
    }
    const viewNext = { ...s.viewSettings, [leafId]: next };
    return { viewSettings: viewNext, graphVersion: s.graphVersion + 1 };
  }),

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

  hideForLeaf: (leafId, ids) => {
    const s = get();
    const leaf = s.viewSettings[leafId] ?? {};
    const layers = leaf.hideLayers ?? { individual: s.hiddenIds, subtrees: {}, filesBulkActive: false, filesBulkExempt: [] };
    const next = { ...leaf, hideLayers: { ...layers, individual: [...new Set([...layers.individual, ...ids])] } };
    set({ viewSettings: { ...s.viewSettings, [leafId]: next }, graphVersion: s.graphVersion + 1 });
  },

  eyeRevealForLeaf: (leafId, id) => {
    const s = get();
    const leaf = s.viewSettings[leafId] ?? {};
    const layers = leaf.hideLayers;
    if (!layers) return;
    const individual = layers.individual.filter((i) => i !== id);
    const sub: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(layers.subtrees)) {
      const filtered = (v as string[]).filter((i) => i !== id);
      if (filtered.length > 0) sub[k] = filtered;
    }
    const filesBulkExempt = layers.filesBulkActive ? [...layers.filesBulkExempt, id] : layers.filesBulkExempt;
    const next = { ...leaf, hideLayers: { ...layers, individual, subtrees: sub, filesBulkExempt } };
    set({ viewSettings: { ...s.viewSettings, [leafId]: next }, graphVersion: s.graphVersion + 1 });
  },

  hideSubtreeForLeaf: (leafId, folderId, descendantIds) => {
    const s = get();
    const leaf = s.viewSettings[leafId] ?? {};
    const layers = leaf.hideLayers ?? { individual: [], subtrees: {}, filesBulkActive: false, filesBulkExempt: [] };
    const next = { ...leaf, hideLayers: { ...layers, subtrees: { ...layers.subtrees, [folderId]: descendantIds } } };
    set({ viewSettings: { ...s.viewSettings, [leafId]: next }, graphVersion: s.graphVersion + 1 });
  },

  showSubtreeForLeaf: (leafId, folderId) => {
    const s = get();
    const leaf = s.viewSettings[leafId] ?? {};
    const layers = leaf.hideLayers;
    if (!layers) return;
    const subtrees = { ...layers.subtrees };
    delete subtrees[folderId];
    const next = { ...leaf, hideLayers: { ...layers, subtrees } };
    set({ viewSettings: { ...s.viewSettings, [leafId]: next }, graphVersion: s.graphVersion + 1 });
  },

  setFilesBulkForLeaf: (leafId, active) => {
    const s = get();
    const leaf = s.viewSettings[leafId] ?? {};
    const layers = leaf.hideLayers ?? { individual: [], subtrees: {}, filesBulkActive: false, filesBulkExempt: [] };
    const next = { ...leaf, hideLayers: { ...layers, filesBulkActive: active, filesBulkExempt: active ? [] : layers.filesBulkExempt } };
    set({ viewSettings: { ...s.viewSettings, [leafId]: next }, graphVersion: s.graphVersion + 1 });
  },

  revealAllForLeaf: (leafId) => {
    const s = get();
    const leaf = s.viewSettings[leafId] ?? {};
    const next = { ...s.viewSettings, [leafId]: { ...leaf, hideLayers: { individual: [], subtrees: {}, filesBulkActive: false, filesBulkExempt: [] } } };
    set({ viewSettings: next, graphVersion: s.graphVersion + 1 });
  },

  hideNodesForLeaf: (leafId, ids) => get().hideForLeaf(leafId, ids),

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
  canvasSize: { width: 0, height: 0 },
  setCanvasSize: (size) => set({ canvasSize: size }),
  setLoading: (loading) => set({ loading }),

  setShowFiles: (show) => {
    const { nodes, edges, graphVersion, categoryFilter, maxDisplayDepth, autoHideThreshold, revealedRootIds, autoHiddenIds } = get();
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
      // The toggle must not bypass other hide mechanisms: keep files beyond the
      // display-depth limit hidden...
      const nodeDepth = new Map(nodes.map((n) => [n.id, n.data.depth ?? 0]));
      const indieSet = new Set(get().independentlyHiddenIds);
      const revealSet = new Set(
        revealable
          .filter((id) => maxDisplayDepth <= 0 || (nodeDepth.get(id) ?? 0) <= maxDisplayDepth)
          .filter((id) => !indieSet.has(id)),
      );
      // ...and re-apply the large-folder auto-hide limit after revealing, so
      // files under over-threshold folders stay hidden (and tagged autoHiddenIds).
      const revealedHidden = before.hiddenIds.filter((id) => !revealSet.has(id));
      const { hiddenIds: nextHidden, autoHiddenIds: nextAuto } = reconcileAutoHide(
        nodes,
        edges,
        revealedHidden,
        autoHiddenIds,
        revealedRootIds,
        autoHideThreshold,
      );
      const after = { ...before, showFiles: true, hiddenIds: nextHidden, autoHiddenIds: nextAuto };
      if (JSON.stringify(after) !== JSON.stringify(before)) get().pushOp(viewStateOp(before, after));
      set((s) => ({ showFiles: true, hiddenIds: nextHidden, autoHiddenIds: nextAuto, graphVersion: graphVersion + 1 }));
    } else {
      const after = { ...before, showFiles: false, hiddenIds: [...new Set([...before.hiddenIds, ...fileIds])] };
      if (JSON.stringify(after) !== JSON.stringify(before)) get().pushOp(viewStateOp(before, after));
      set((s) => ({ showFiles: false, hiddenIds: [...new Set([...s.hiddenIds, ...fileIds])], graphVersion: graphVersion + 1 }));
    }
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

  // ── Panel layout actions ──

  _persistLayout: () => {
    const s = get();
    saveLayoutToStorage({ sidebarSide: s.sidebarSide, panelTree: s.panelTree });
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