"use client";
// GraphState is a loose type — the actual shape is inferred from the
// combined Zustand store. Each slice file defines its own state shape
// via StateCreator, and createStore.ts merges them all.
export type GraphState = Record<string, any>;

export interface HistoryEntry {
  ops: import("@/lib/fewer/types").HistoryOp[];
  timestamp: number;
}

/** Undo/redo stacks for one panel leaf (50 steps each). */
export interface LeafStacks {
  past: HistoryEntry[];
  future: HistoryEntry[];
}
