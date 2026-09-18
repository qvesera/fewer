"use client";
import { StateCreator } from "zustand";
import type { GraphState, HistoryEntry, LeafStacks } from "./types";
import type { HistoryOp, ViewState, FileCategory } from "@/lib/fewer/types";
import { applyOps, undoOps, getUndoViewState, getRedoViewState, leafPositionsFor, leafMoveOrigin } from "@/lib/fewer/history";
import { applySearchHighlight } from "./searchHighlight";

const MAX_HISTORY = 50;
const EMPTY_STACK: LeafStacks = { past: [], future: [] };

/** Append an entry to a stack, keeping at most MAX_HISTORY steps. */
function cap(entries: HistoryEntry[]): HistoryEntry[] {
  return entries.slice(-MAX_HISTORY);
}

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
    autoHiddenIds: (state.autoHiddenIds ?? []) as string[],
    categoryFilter: (state.categoryFilter ?? []) as FileCategory[],
    categoryHiddenIds: (state.categoryHiddenIds ?? []) as string[],
    independentlyHiddenIds: (state.independentlyHiddenIds ?? []) as string[],
    tagFilter: (state.tagFilter ?? []) as string[],
    tagFilterHiddenIds: (state.tagFilterHiddenIds ?? []) as string[],
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
  if (view.autoHiddenIds !== undefined) patch.autoHiddenIds = view.autoHiddenIds;
  if (view.categoryFilter !== undefined) patch.categoryFilter = view.categoryFilter;
  if (view.categoryHiddenIds !== undefined) patch.categoryHiddenIds = view.categoryHiddenIds;
  if (view.independentlyHiddenIds !== undefined) patch.independentlyHiddenIds = view.independentlyHiddenIds;
  if (view.tagFilter !== undefined) patch.tagFilter = view.tagFilter;
  if (view.tagFilterHiddenIds !== undefined) patch.tagFilterHiddenIds = view.tagFilterHiddenIds;
  if (view.tags !== undefined) patch.tags = view.tags;
  return patch;
}

export type HistorySliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    past: HistoryEntry[];
    future: HistoryEntry[];
    /**
     * Undo/redo stacks for leaves that are NOT active. The active leaf's stacks
     * are the live `past`/`future` fields, so every reader (toolbar, shortcuts,
     * tests) sees the active leaf's history without knowing about leaves.
     */
    leafHistories: Record<string, LeafStacks>;
    pushOp: (op: HistoryOp | HistoryOp[], leafId?: string) => void;
    undo: () => void;
    redo: () => void;
  }
>;

/**
 * Move the live `past`/`future` stacks onto `nextLeafId`, stashing the outgoing
 * leaf's stack. Called from every path that activates a leaf, so the live stacks
 * always belong to the active leaf.
 *
 * Ops recorded before any leaf was active (fresh load, keyboard-only edit) ride
 * along into the first activated leaf instead of being silently dropped.
 */
export function swapLeafHistory(state: GraphState, nextLeafId: string | null): Partial<GraphState> {
  const current = (state.activeLeafId ?? null) as string | null;
  if (!nextLeafId || nextLeafId === current) return {};
  const stored = (state.leafHistories ?? {}) as Record<string, LeafStacks>;
  const live: LeafStacks = { past: state.past ?? [], future: state.future ?? [] };
  const leafHistories = { ...stored };
  let incoming: LeafStacks;
  if (current) {
    leafHistories[current] = live;
    incoming = stored[nextLeafId] ?? EMPTY_STACK;
  } else {
    const existing = stored[nextLeafId];
    incoming = existing
      ? {
          past: cap([...live.past, ...existing.past]),
          future: existing.future.length > 0 ? existing.future : live.future,
        }
      : live;
  }
  return { activeLeafId: nextLeafId, past: incoming.past, future: incoming.future, leafHistories };
}

/** Drop a closed leaf's stored stack (joinArea). */
export function dropLeafHistory(state: GraphState, leafId: string): Partial<GraphState> {
  const stored = (state.leafHistories ?? {}) as Record<string, LeafStacks>;
  if (!(leafId in stored)) return {};
  const next = { ...stored };
  delete next[leafId];
  return { leafHistories: next };
}

/**
 * Per-leaf position patch for a drag op: leaf canvases render from
 * `viewSettings[leafId].positions`, so undoing a move also has to rewrite the
 * recording leaf's map (patching shared `nodes[].position` alone looks like a
 * no-op in panel mode — and, worse, it plants one view's private coordinates
 * into the seed every other view renders from).
 */
function leafPositionPatch(
  leafId: string | null,
  viewSettings: GraphState["viewSettings"],
  ops: HistoryOp[],
  pick: "from" | "to",
): Partial<GraphState> {
  if (!leafId) return {};
  const leaf = viewSettings?.[leafId];
  // A leaf-tagged drag always has a view to restore. If that view's map is gone
  // (cleared, or the leaf was rebuilt), write just the cards it moved so the
  // drag still undoes in that view instead of silently doing nothing.
  const positions =
    leafPositionsFor(leaf?.positions, ops, pick) ??
    (leafMoveOrigin(ops) ? leafPositionsFor({}, ops, pick) : null);
  if (!positions) return {};
  return { viewSettings: { ...viewSettings, [leafId]: { ...leaf, positions } } };
}

export const createHistorySlice: HistorySliceCreator = (set, get) => ({
  past: [],
  future: [],
  leafHistories: {},

  pushOp: (op, leafId) => {
    const state = get();
    const ops = Array.isArray(op) ? op : [op];
    const entry: HistoryEntry = { ops, timestamp: Date.now() };
    const target = leafId ?? (state.activeLeafId as string | null);
    if (target && target !== state.activeLeafId) {
      // Op completed in a leaf that isn't active (drag in a split viewport) —
      // append to that leaf's stored stack instead of the active one.
      const prev = (state.leafHistories?.[target] ?? EMPTY_STACK) as LeafStacks;
      set({
        leafHistories: {
          ...state.leafHistories,
          [target]: { past: cap([...prev.past, entry]), future: [] },
        },
      });
      return;
    }
    set({
      past: cap([...state.past, entry]),
      future: [],
    });
  },

  undo: () => {
    const { past, future, nodes, edges, searchQuery, categoryFilter, graphVersion, activeLeafId, viewSettings, selectedNodeIds } = get();
    if (past.length === 0) return;
    const entry = past[past.length - 1];
    const { nodes: prevNodes, edges: prevEdges } = undoOps(nodes, edges, entry.ops);
    // Restore view-state that the last op changed (e.g. hiddenIds after a delete/cut).
    let viewPatch: Partial<GraphState> = {};
    const lastOp = entry.ops[entry.ops.length - 1];
    const vs = getUndoViewState(lastOp);
    if (vs) viewPatch = applyViewState(get(), vs);
    const prevSelection = selectedNodeIds.filter((id) => prevNodes.some((n) => n.id === id));
    set({
      past: past.slice(0, -1),
      future: [entry, ...future].slice(0, MAX_HISTORY),
      nodes: applySearchHighlight(prevNodes, searchQuery, categoryFilter),
      edges: prevEdges,
      graphVersion: graphVersion + 1,
      selectedNodeIds: prevSelection,
      ...viewPatch,
      ...leafPositionPatch(leafMoveOrigin(entry.ops) ?? (activeLeafId as string | null), viewSettings, entry.ops, "from"),
    });
  },

  redo: () => {
    const { past, future, nodes, edges, searchQuery, categoryFilter, graphVersion, activeLeafId, viewSettings } = get();
    if (future.length === 0) return;
    const entry = future[0];
    const { nodes: nextNodes, edges: nextEdges } = applyOps(nodes, edges, entry.ops);
    let viewPatch: Partial<GraphState> = {};
    const lastOp = entry.ops[entry.ops.length - 1];
    const vs = getRedoViewState(lastOp);
    if (vs) viewPatch = applyViewState(get(), vs);
    set({
      future: future.slice(1),
      past: cap([...past, entry]),
      nodes: applySearchHighlight(nextNodes, searchQuery, categoryFilter),
      edges: nextEdges,
      graphVersion: graphVersion + 1,
      ...viewPatch,
      ...leafPositionPatch(leafMoveOrigin(entry.ops) ?? (activeLeafId as string | null), viewSettings, entry.ops, "to"),
    });
  },
});