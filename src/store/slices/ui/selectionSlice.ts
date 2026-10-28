"use client";
import { StateCreator } from "zustand";
import { markLoop } from "@/lib/fewer/loopProbe";
import type { GraphState } from "../types";
import { swapLeafHistory } from "../historySlice";

/** Element-wise id list equality — a selection write that changes nothing is a
 *  no-op, so a re-click of the same card (or a box-select frame that reports the
 *  same set) does not churn the canvas. */
function sameIds(a: string[] | undefined, b: string[]): boolean {
  if (a === undefined || a.length !== b.length) return false;
  for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export type SelectionSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    selectedNodeIds: string[];
    /** Ids of selected group frames (T-135). Deliberately global, not per-leaf:
     *  groups live in flow coordinates via ViewportPortal and aren't per-view
     *  nodes, so there's nothing to key a per-leaf map by. Group and card
     *  selection are mutually exclusive — see setSelectedGroupIds. */
    selectedGroupIds: string[];
    /** Per-leaf selection storage. Key = leafId. */
    leafSelections: Record<string, string[]>;
    /** ID of the most recently interacted graph leaf (for keyboard shortcuts). */
    activeLeafId: string | null;
    /** Bumped when the SELECTION changes. Deliberately separate from
     *  `graphVersion`, which means "the graph's contents changed" and makes the
     *  canvas rebuild its whole node and edge arrays. Selection used to bump that
     *  too, so a click — and every pointer-move of a box-select drag — replaced
     *  every node object and renormali[z]ed every edge. */
    selectionVersion: number;
    /** Transient ids to ring on the canvas while a sidebar (Hidden panel) row is hovered.
     *  Deliberately separate from data.highlighted so hover never pollutes node data,
     *  history snapshots, or search highlighting. */
    hoverHighlightIds: string[];
    renamingId: string | null;
    renameSource: "canvas" | "folder" | null;
    zoomToNode: { nodeId: string; timestamp: number } | null;
    zoomToNodeIds: string[] | null;
    mousePosition: { x: number; y: number } | null;
    pastePosition: { x: number; y: number } | null;
    /** Flow-space position captured when creating a node via handle drag (onConnectEnd). */
    pendingCreatePosition: { x: number; y: number } | null;
    focusedNodeId: string | null;

    setSelectedNodeIds: (ids: string[]) => void;
    /** Select group frames. Mutually exclusive with card selection: choosing a
     *  group clears the card selection (and vice versa, in setSelectedNodeIds). */
    setSelectedGroupIds: (ids: string[]) => void;
    setSelectionForLeaf: (leafId: string, ids: string[]) => void;
    setActiveLeaf: (leafId: string | null) => void;
    /** Ring a transient set of node ids on the canvas (sidebar row hover). */
    setHoverHighlight: (ids: string[]) => void;
    setRenamingId: (id: string | null, source?: "canvas" | "folder") => void;
    setZoomToNode: (nodeId: string | null) => void;
    setZoomToNodeIds: (ids: string[] | null) => void;
    setMousePosition: (pos: { x: number; y: number } | null) => void;
    setPastePosition: (pos: { x: number; y: number } | null) => void;
    setPendingCreatePosition: (pos: { x: number; y: number } | null) => void;
    setFocusedNodeId: (id: string | null) => void;
  }
>;

/**
 * Action bodies at module scope, one function per action — the #451 pattern.
 * (A `build*Methods` factory would only rename the finding: repowise counts the
 * returned arrows' bodies into the enclosing builder — see `buildClipboardMethods`,
 * CCN 73.) The creator below stays a flat dispatch table.
 */
type SelSet = Parameters<SelectionSliceCreator>[0];
type SelGet = () => GraphState;

// The canonical selection is the id list. React Flow's own node array carries
// the `selected` flags the canvas paints; the store's nodes do NOT — they are
// stamped from this list in the canvas lens (see viewState.stampSelection),
// because writing the flags back into the store's node array made every click
// replace every node object, invalidating the identity-cached tree index and
// every card's child-list memo.
function setSelectedNodeIds(set: SelSet, ids: string[]): void {
  set((s) => {
    const base: Record<string, unknown> = sameIds(s.selectedNodeIds, ids) ? {} : { selectedNodeIds: ids, selectionVersion: s.selectionVersion + 1 };
    // Mirror into active leaf's selection so per-view sync picks it up
    if (s.activeLeafId && !sameIds(s.selectedNodeIds, ids)) {
      base.leafSelections = { ...s.leafSelections, [s.activeLeafId]: ids };
    }
    // Mutual exclusion (T-135): a real card selection clears any selected
    // group frames — and so does an empty list (Escape/blur clearing).
    if (s.selectedGroupIds.length > 0) base.selectedGroupIds = [];
    return base;
  });
}

function setSelectedGroupIds(set: SelSet, ids: string[]): void {
  set((s) => {
    if (sameIds(s.selectedGroupIds, ids)) return {};
    // Mutual exclusion: selecting a group clears the card selection so a
    // Delete or a drag always has one unambiguous target. Bump
    // selectionVersion so the canvas repaints any group ring off.
    return {
      selectedGroupIds: ids,
      selectionVersion: s.selectionVersion + 1,
      ...(ids.length > 0 && s.selectedNodeIds.length > 0
        ? { selectedNodeIds: [], leafSelections: {} }
        : {}),
    };
  });
}

function setSelectionForLeaf(set: SelSet, leafId: string, ids: string[]): void {
  set((s) => {
    const prev = s.leafSelections[leafId];
    // React Flow re-reports its selection whenever a view's nodes are re-pushed,
    // so every report is either an echo of what this canvas already paints or a
    // genuinely new selection. An ECHO writes NOTHING — not the entry, not
    // `selectedNodeIds`, and crucially not `activeLeafId`: two mounted canvases
    // would otherwise trade the active leaf back and forth (each flip makes the
    // other view inactive, which re-pushes its edges, which makes it report
    // again) until React hit its 50-nested-update limit and tore the tree down
    // (#285). Activation is an input event now — a pointer landing in a canvas
    // calls setActiveLeaf before any report arrives.
    if (prev !== undefined && sameIds(prev, ids)) return {};
    // An empty report from a view that owns nothing is React Flow re-deriving
    // its own initial state: it must not clear another view's selection or
    // steal activation. A real deselect happens in the owner (which this
    // pointer-down already made the active view).
    if (prev === undefined && ids.length === 0) return {};

    markLoop("write:selection");
    const selectionChanged =
      prev === undefined || !sameIds(prev, ids) || !sameIds(s.selectedNodeIds, ids);
    return {
      ...swapLeafHistory(s, leafId),
      leafSelections: { ...s.leafSelections, [leafId]: ids },
      activeLeafId: leafId,
      selectedNodeIds: ids,
      ...(selectionChanged ? { selectionVersion: s.selectionVersion + 1 } : {}),
    };
  });
}

function setActiveLeaf(set: SelSet, leafId: string | null): void {
  set((s) => {
    if (!leafId || leafId === s.activeLeafId) return {};
    const ids = s.leafSelections[leafId] ?? [];
    // Each leaf owns its own 50-step undo history — swapping the live
    // `past`/`future` stacks is what makes undo/redo leaf-scoped.
    return {
      ...swapLeafHistory(s, leafId),
      activeLeafId: leafId,
      selectedNodeIds: ids,
      // Which selection the canvas shows just changed.
      selectionVersion: s.selectionVersion + 1,
    };
  });
}

function setRenamingId(set: SelSet, get: SelGet, id: string | null, source?: "canvas" | "folder"): void {
  if (id) {
    const { hiddenIds, edges } = get();
    if (hiddenIds.includes(id)) {
      const parentEdge = edges.find((e) => e.target === id);
      if (parentEdge) { set({ renamingId: id, renameSource: source ?? "canvas", zoomToNode: { nodeId: parentEdge.source, timestamp: Date.now() } }); return; }
    }
  }
  set({ renamingId: id, renameSource: id ? (source ?? "canvas") : null, zoomToNode: id ? { nodeId: id, timestamp: Date.now() } : null });
}

function setZoomToNode(set: SelSet, nodeId: string | null): void {
  set({ zoomToNode: nodeId ? { nodeId, timestamp: Date.now() } : null });
}

export const createSelectionSlice: SelectionSliceCreator = (set, get) => ({
  selectedNodeIds: [],
  selectedGroupIds: [],
  leafSelections: {},
  activeLeafId: null,
  selectionVersion: 0,
  hoverHighlightIds: [],
  renamingId: null,
  renameSource: null,
  zoomToNode: null,
  zoomToNodeIds: null,
  mousePosition: null,
  pastePosition: null,
  pendingCreatePosition: null,
  focusedNodeId: null,

  setSelectedNodeIds: (ids) => setSelectedNodeIds(set, ids),
  setSelectedGroupIds: (ids) => setSelectedGroupIds(set, ids),
  setHoverHighlight: (ids) => set({ hoverHighlightIds: ids }),

  setSelectionForLeaf: (leafId, ids) => setSelectionForLeaf(set, leafId, ids),

  setActiveLeaf: (leafId) => setActiveLeaf(set, leafId),

  setRenamingId: (id, source) => setRenamingId(set, get, id, source),

  setZoomToNode: (nodeId) => setZoomToNode(set, nodeId),
  setZoomToNodeIds: (ids) => set({ zoomToNodeIds: ids }),
  setMousePosition: (pos) => set({ mousePosition: pos }),
  setPastePosition: (pos) => set({ pastePosition: pos }),
  setPendingCreatePosition: (pos) => set({ pendingCreatePosition: pos }),
  setFocusedNodeId: (id) => set({ focusedNodeId: id }),
});
