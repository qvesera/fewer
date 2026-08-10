"use client";
import { StateCreator } from "zustand";
import type { GraphState, HistoryEntry } from "./types";
import type { HistoryOp, ViewState } from "@/lib/fewer/types";
import { applyOps, undoOps, getUndoViewState, getRedoViewState } from "@/lib/fewer/history";

const MAX_HISTORY = 50;

/**
 * Capture the current view-state fields from the store. Used to build
 * before/after sidecars on ops and to restore them on undo/redo.
 */
export function captureViewState(state: GraphState): ViewState {
  return {
    hiddenIds: (state.hiddenIds ?? []) as string[],
    showFiles: state.showFiles as boolean,
    maxDisplayDepth: state.maxDisplayDepth as number,
    autoHideThreshold: state.autoHideThreshold as number,
  };
}

/** Build a `view-state` history op from a before/after view snapshot. */
export function viewStateOp(before: ViewState, after: ViewState): { type: "view-state"; before: ViewState; after: ViewState } {
  return { type: "view-state", before, after };
}

/**
 * Merge a partial view-state diff into the store. Only provided keys are applied.
 */
function applyViewState(state: GraphState, view: Partial<ViewState> | null) {
  if (!view) return {};
  const patch: Partial<GraphState> = {};
  if (view.hiddenIds !== undefined) patch.hiddenIds = view.hiddenIds;
  if (view.showFiles !== undefined) patch.showFiles = view.showFiles;
  if (view.maxDisplayDepth !== undefined) patch.maxDisplayDepth = view.maxDisplayDepth;
  if (view.autoHideThreshold !== undefined) patch.autoHideThreshold = view.autoHideThreshold;
  return patch;
}

export type HistorySliceCreator = StateCreator<
  GraphState,
  [],
  [],
  { past: HistoryEntry[]; future: HistoryEntry[]; pushOp: (op: HistoryOp | HistoryOp[]) => void; undo: () => void; redo: () => void }
>;

export const createHistorySlice: HistorySliceCreator = (set, get) => ({
  past: [],
  future: [],

  pushOp: (op) => {
    const { past } = get();
    const ops = Array.isArray(op) ? op : [op];
    const entry: HistoryEntry = { ops, timestamp: Date.now() };
    set({
      past: [...past, entry].slice(-MAX_HISTORY),
      future: [],
    });
  },

  undo: () => {
    const { past, future, nodes, edges, searchQuery } = get();
    if (past.length === 0) return;
    const entry = past[past.length - 1];
    const { nodes: prevNodes, edges: prevEdges } = undoOps(nodes, edges, entry.ops);
    // Restore view-state that the last op changed (e.g. hiddenIds after a delete/cut).
    let viewPatch: Partial<GraphState> = {};
    const lastOp = entry.ops[entry.ops.length - 1];
    const vs = getUndoViewState(lastOp);
    if (vs) viewPatch = applyViewState(get(), vs);
    set({
      past: past.slice(0, -1),
      future: [entry, ...future].slice(0, MAX_HISTORY),
      nodes: applySearchInternal(prevNodes, searchQuery),
      edges: prevEdges,
      ...viewPatch,
    });
    if (needsRelayout(lastOp)) get().relayout();
  },

  redo: () => {
    const { past, future, nodes, edges, searchQuery } = get();
    if (future.length === 0) return;
    const entry = future[0];
    const { nodes: nextNodes, edges: nextEdges } = applyOps(nodes, edges, entry.ops);
    let viewPatch: Partial<GraphState> = {};
    const lastOp = entry.ops[entry.ops.length - 1];
    const vs = getRedoViewState(lastOp);
    if (vs) viewPatch = applyViewState(get(), vs);
    set({
      future: future.slice(1),
      past: [...past, entry].slice(-MAX_HISTORY),
      nodes: applySearchInternal(nextNodes, searchQuery),
      edges: nextEdges,
      ...viewPatch,
    });
    if (needsRelayout(lastOp)) get().relayout();
  },
});

/**
 * Structural ops change the graph's topology and benefit from a re-flow.
 * Position-only (drag) and resize ops must NOT be re-laid-out, otherwise the
 * restored manual positions/dimensions would be overwritten by the layout engine.
 */
function needsRelayout(op: HistoryOp): boolean {
  switch (op.type) {
    case "move-positions":
    case "resize":
      return false;
    case "view-state":
      return false;
    default:
      return true;
  }
}

function applySearchInternal(
  nodes: GraphState["nodes"],
  query: string,
): GraphState["nodes"] {
  if (!query.trim()) {
    return nodes.map((n) => ({
      ...n,
      data: { ...n.data, highlighted: false, dimmed: false },
    }));
  }
  const q = query.toLowerCase();
  return nodes.map((n) => {
    const matches =
      n.data.label.toLowerCase().includes(q) ||
      (n.data.extension ?? "").toLowerCase().includes(q);
    return {
      ...n,
      data: { ...n.data, highlighted: matches, dimmed: !matches },
    };
  });
}