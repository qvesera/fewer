"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "../types";
import type { ViewSettings } from "@/lib/fewer/viewState";
import {
  saveLayoutToStorage,
  clearLayoutStorage,
  defaultLayout,
  accessibleLayout,
} from "@/lib/fewer/panelLayout";
import * as treeModule from "@/lib/fewer/panelTree";
import type { PanelNode } from "@/lib/fewer/panelTree";
import { can, type Tier } from "@/lib/fewer/tiers";
import { markLoop } from "@/lib/fewer/loopProbe";
import { dropLeafHistory } from "../historySlice";

/**
 * What a rewritten panel tree implies for per-leaf selection (#285).
 *
 * Leaves the tree gained get an explicit entry — empty, because a brand-new
 * canvas must not borrow another view's shared selection (that borrow is what
 * looped two canvases into React's update-depth limit). Leaves it lost are
 * dropped, so `leafSelections` stops growing forever. And an owner that was
 * joined away hands activation to whatever survived, instead of leaving no view
 * to own the shared list.
 *
 * Before any leaf owns the shared list (pristine session, e.g. a search jump
 * before the first canvas interaction) the shared list *is* the only selection,
 * so new leaves keep painting it.
 */
function panelSelectionPatch(s: GraphState, tree: PanelNode): Partial<GraphState> {
  const prev: Record<string, string[]> = s.leafSelections ?? {};
  const wanted = new Set(treeModule.leafList(tree).map((l) => l.area.id));
  const patch: Partial<GraphState> = {};

  let changed = false;
  const next: Record<string, string[]> = {};
  for (const id of wanted) {
    const own = prev[id];
    if (own !== undefined) { next[id] = own; continue; }
    next[id] = s.activeLeafId === null ? (s.selectedNodeIds as string[]) : [];
    changed = true;
  }
  if (!changed) {
    for (const id of Object.keys(prev)) {
      if (!wanted.has(id)) { changed = true; break; }
    }
  }
  if (changed) patch.leafSelections = next;

  if (s.activeLeafId !== null && !wanted.has(s.activeLeafId)) {
    const survivor =
      treeModule.getPrimary(tree)?.area.id ?? treeModule.leafList(tree)[0]?.area.id ?? null;
    patch.activeLeafId = survivor;
    patch.selectedNodeIds = survivor !== null ? (next[survivor] ?? []) : [];
    patch.selectionVersion = (s.selectionVersion as number) + 1;
  }
  return patch;
}

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
    /** Derived from auth + profile.plan — never persisted. */
    tier: Tier;
    /**
     * Bumped when the user asks for a re-flow — a layout-direction change or
     * Organize. Each canvas watches it and fits the whole graph to its own view
     * afterwards (#286). Separate from `graphVersion` on purpose: that bumps for
     * every relayout (cut/paste, parent/unparent, …), and fitting on those made
     * the viewport jump under the user while they were working.
     */
    reflowVersion: number;
    /** The leaf the re-flow targeted, or null for every mounted canvas. */
    reflowTarget: string | null;
    /** Record a user-requested re-flow; `target` limits which canvases fit. */
    bumpReflow: (target?: string | null) => void;

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
    /** @internal — schedules the layout write (debounced). */
    _persistLayout: () => void;
    /** @internal — writes the layout to localStorage now. */
    _persistLayoutNow: () => void;
  }
>;

/**
 * Debounce state for _persistLayout. Coalesces the burst of writes a single
 * gesture produces; flushed on pagehide so the last edit survives a close.
 */
const PERSIST_DEBOUNCE_MS = 300;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pagehideBound = false;

/**
 * A real browser, not just "window exists": bun's test env lets a suite stub a
 * `window` + `localStorage` pair, and those suites assert the storage contents
 * right after the action — a debounce there would swallow the write.
 */
const IS_BROWSER = typeof window !== "undefined" && typeof document !== "undefined";

/** Cancel a pending debounced write and flush it now (pagehide / unmount). */
function flushLayoutPersist(get: () => GraphState) {
  if (persistTimer === null) return;
  clearTimeout(persistTimer);
  persistTimer = null;
  get()._persistLayoutNow();
}

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
  tier: "guest" as Tier,
  reflowVersion: 0,
  reflowTarget: null,

  bumpReflow: (target = null) => set((s) => ({
    reflowVersion: s.reflowVersion + 1,
    reflowTarget: target,
  })),

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
    // A direction change is a user-requested re-flow: this view fits afterwards.
    if (key === "direction") get().bumpReflow(leafId);
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
    // Same as setViewSetting: a real direction change re-flows THIS view, and
    // the canvas fits it once the re-derivation settles (#286).
    if (patch.direction !== undefined && patch.direction !== (leaf as Record<string, unknown>).direction) {
      get().bumpReflow(leafId);
    }
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
    const current = leaf.positions ?? {};
    // Skip reports that change nothing: React Flow re-reports a card's position
    // when it re-adopts the node array we just pushed, and an unguarded write
    // here starts the whole store → lens → push → report round trip again on a
    // value that did not move (#281).
    const moved = entries.filter(({ id, pos }) => {
      const prev = current[id];
      return !prev || prev.x !== pos.x || prev.y !== pos.y;
    });
    if (moved.length === 0) return {};
    markLoop("write:positions-batch");
    const positions = { ...current };
    for (const { id, pos } of moved) positions[id] = pos;
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
    // Drop the entry entirely when positions were its only field. An empty
    // `{ positions: undefined }` entry still reads as "this view has per-view
    // settings" to needsLayoutDerivation and to the parse/sanitize round-trip.
    const remaining = { ...leaf };
    delete remaining.positions;
    const viewNext = { ...s.viewSettings };
    if (Object.keys(remaining).length > 0) viewNext[leafId] = remaining;
    else delete viewNext[leafId];
    set({ viewSettings: viewNext, graphVersion: s.graphVersion + 1 });
    // Persist like every other viewSettings mutator. Without this the cleared
    // positions are still in localStorage, so the next load restores them and
    // the per-view positions outrank the layout engine again — which made
    // Organize and the Crown Shyness slider look inert after a drag.
    get()._persistLayout();
  },
  setMiniMapPosition: (pos) => set({ miniMapPosition: pos }),
  setMiniMapSize: (size) => set({ miniMapSize: size }),
  setMiniMapX: (x) => set({ miniMapX: x }),
  setMiniMapY: (y) => set({ miniMapY: y }),
  setScrollAction: (action) => set({ scrollAction: action }),
  setCanvasSize: (size) => set((s) => {
    // A ResizeObserver tick fires whenever the element is observed, not only
    // when it actually resized, and the write feeds the minimap sliders — a
    // fresh object on every tick re-renders SettingsDialog for nothing.
    if (s.canvasSize.width === size.width && s.canvasSize.height === size.height) return {};
    return { canvasSize: size };
  }),

  // ── Panel layout actions ──

  _persistLayout: () => {
    // Debounced: a single reveal gesture persisted the whole snapshot (panel
    // tree + every view's settings and per-view positions) synchronously on
    // each of its store writes — megabytes of JSON into localStorage, several
    // times per sidebar click. No window (tests, SSR) writes straight through.
    if (!IS_BROWSER) {
      get()._persistLayoutNow();
      return;
    }
    // A pending debounce must not be lost when the tab goes away.
    if (!pagehideBound) {
      pagehideBound = true;
      window.addEventListener("pagehide", () => flushLayoutPersist(get));
    }
    if (persistTimer !== null) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      get()._persistLayoutNow();
    }, PERSIST_DEBOUNCE_MS);
  },

  _persistLayoutNow: () => {
    const s = get();
    saveLayoutToStorage(
      { sidebarSide: s.sidebarSide, panelTree: s.panelTree, viewSettings: s.viewSettings },
      { keepStoredTree: !can("panelWorkspace", s.tier) },
    );
  },

  setSidebarSide: (side) => {
    set({ sidebarSide: side });
    get()._persistLayout();
  },

  setPanelTree: (tree) => {
    const next = accessibleLayout(tree, can("panelWorkspace", get().tier));
    set({ panelTree: next, ...panelSelectionPatch(get(), next) });
    get()._persistLayout();
  },

  splitArea: (id, dir, ratio) => {
    if (!can("panelWorkspace", get().tier)) return;
    const tree = get().panelTree;
    const newTree = treeModule.splitLeaf(tree, id, dir, ratio);
    if (newTree !== tree) get().setPanelTree(newTree);
  },

  joinArea: (id) => {
    if (!can("panelWorkspace", get().tier)) return;
    const tree = get().panelTree;
    const newTree = treeModule.joinLeaf(tree, id);
    if (newTree !== tree) {
      // The joined leaf is gone — its undo/redo stack goes with it, and so does
      // its per-leaf selection (panelSelectionPatch, #285).
      // Don't funnel through setPanelTree — dropLeafHistory patches state in
      // the same call, avoiding a double-set on panelTree.
      set({ panelTree: newTree, ...dropLeafHistory(get(), id), ...panelSelectionPatch(get(), newTree) });
      get()._persistLayout();
    }
  },

  setAreaEditor: (id, editor) => {
    if (!can("panelWorkspace", get().tier)) return;
    const tree = get().panelTree;
    const newTree = treeModule.setLeafEditor(tree, id, editor);
    if (newTree !== tree) get().setPanelTree(newTree);
  },

  insertAreaAtEdge: (side, editor) => {
    if (!can("panelWorkspace", get().tier)) return;
    const tree = get().panelTree;
    const newTree = treeModule.insertLeafAtEdge(tree, side, editor);
    get().setPanelTree(newTree);
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
    set({ sidebarSide: d.sidebarSide, panelTree: d.panelTree, ...panelSelectionPatch(get(), d.panelTree) });
    clearLayoutStorage();
    // Drop any queued write, or it would restore the layout we just cleared.
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
  },
});
