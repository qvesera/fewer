"use client";
import { create } from "zustand";
import type { GraphState } from "./slices/types";
import { createHistorySlice } from "./slices/historySlice";
import { createGraphSlice } from "./slices/graphSlice";
import { createUiSlice } from "./slices/uiSlice";
import { createLayoutSlice } from "./slices/layoutSlice";
import { createThemeSlice } from "./slices/themeSlice";
import { createTagsSlice } from "./slices/tagsSlice";

export const useGraphStore = create<GraphState>()((set, get, api) => ({
  ...createHistorySlice(set, get, api),
  ...createGraphSlice(set, get, api),
  ...createUiSlice(set, get, api),
  ...createLayoutSlice(set, get, api),
  ...createThemeSlice(set, get, api),
  ...createTagsSlice(set, get, api),
  /**
   * Record a completed drag operation so undo restores original positions.
   * Called by GraphCanvas on drag stop (single node or multi-selection).
   * `leafId` tags the op with the canvas that recorded it — a drag in a
   * non-active split viewport belongs to that leaf's history, and its per-view
   * position map (not the shared one) is what undo has to restore. The tag also
   * rides on the op itself so the history layer knows not to relocate the
   * shared positions (which this drag never touched).
   */
  recordDragMoves: (moves: { nodeId: string; from: { x: number; y: number }; to: { x: number; y: number } }[], leafId?: string) => {
    const real = moves.filter((m) => m.from.x !== m.to.x || m.from.y !== m.to.y);
    if (real.length === 0) return;
    get().pushOp({ type: "move-positions", moves: real, leafId }, leafId);
  },
  /**
   * Record a completed resize operation so undo restores original dimensions.
   */
  recordResize: (changes: { nodeId: string; from: { w: number; h: number }; to: { w: number; h: number } }[]) => {
    const real = changes.filter((c) => c.from.w !== c.to.w || c.from.h !== c.to.h);
    if (real.length === 0) return;
    get().pushOp({ type: "resize", changes: real });
  },
}));
