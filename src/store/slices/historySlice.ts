"use client";
import { StateCreator } from "zustand";
import type { GraphState, HistoryEntry } from "./types";
import type { HistoryOp } from "@/lib/fewer/types";
import { applyOps, undoOps } from "@/lib/fewer/history";

const MAX_HISTORY = 50;

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
    set({
      past: past.slice(0, -1),
      future: [entry, ...future].slice(0, MAX_HISTORY),
      nodes: applySearchInternal(prevNodes, searchQuery),
      edges: prevEdges,
    });
  },

  redo: () => {
    const { past, future, nodes, edges, searchQuery } = get();
    if (future.length === 0) return;
    const entry = future[0];
    const { nodes: nextNodes, edges: nextEdges } = applyOps(nodes, edges, entry.ops);
    set({
      future: future.slice(1),
      past: [...past, entry].slice(-MAX_HISTORY),
      nodes: applySearchInternal(nextNodes, searchQuery),
      edges: nextEdges,
    });
  },
});

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