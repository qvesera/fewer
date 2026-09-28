import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { EdgeChange } from "@xyflow/react";

import {
  applyEdgeHighlights,
  applyEdgeSelection,
  buildEdgeBase,
  buildTreeLookups,
  edgeTypeFor,
  staticEdgeDashArray,
} from "@/lib/fewer/edgeHighlight";
import type { EdgeAnimationOptions, EdgeThemeColors } from "@/lib/fewer/edgeHighlight";
import type { FewerEdge, FewerNode } from "@/lib/fewer/types";
import type { ResolvedViewSettings } from "@/lib/fewer/viewState";
import { useGraphStore } from "@/store/graphStore";

/**
 * Apply React Flow edge changes to the live selection set. `add` changes carry
 * no id (the edge is the payload) — nothing to track.
 */
export function trackEdgeSelection(selectedEdgeIds: Set<string>, changes: EdgeChange<FewerEdge>[]): void {
  for (const c of changes) {
    if (c.type === "select") {
      if (c.selected) selectedEdgeIds.add(c.id);
      else selectedEdgeIds.delete(c.id);
    } else if (c.type === "remove") {
      selectedEdgeIds.delete(c.id);
    }
  }
}

export interface CanvasEdgesHandlers {
  /** Wraps RF's edge updates, tracking live selection so rebuilds preserve it. */
  handleEdgesChange: (changes: EdgeChange<FewerEdge>[]) => void;
  /** Static stroke-dasharray for the canvas's default edges. */
  dashArray: string | undefined;
  /** Live RF edge-selection ref — shared with the selection hook. */
  selectedEdgeIdsRef: { current: Set<string> };
}

export interface CanvasEdgesDeps {
  onEdgesChange: (changes: EdgeChange<FewerEdge>[]) => void;
  setRfEdges: Dispatch<SetStateAction<FewerEdge[]>>;
  graphVersion: number;
  /** Bumped by selection changes only — the highlight must follow the selection
   *  without a graph rebuild. */
  selectionVersion: number;
  allNodes: FewerNode[];
  allEdges: FewerEdge[];
  /** The view's visible edges (hidden already filtered) — the base style array
   *  is derived from these and memoised, so a selection change reuses it. */
  visibleEdges: FewerEdge[];
  themeColors: EdgeThemeColors;
  vs: ResolvedViewSettings;
  /** Content-stable effective hidden ids (see useStableHiddenIds) — the
   *  highlight effect rebuilds every edge, so it must not key on a per-frame
   *  array identity. */
  hiddenIds: string[];
  animation: EdgeAnimationOptions;
  leafId?: string | null;
  isActive: boolean;
}

/**
 * Edge-selection tracking + themed highlight rebuild for the canvas.
 *
 * The highlight effect reads selections INSIDE itself from the store to avoid
 * unstable empty-array references in deps that cause infinite re-renders.
 * `selectedEdgeIdsRef` is owned here and shared with `useCanvasSelection`
 * (which writes it from RF's authoritative edge-snapshot on selection change).
 */
export function useCanvasEdges({ onEdgesChange, setRfEdges, graphVersion, selectionVersion, allNodes, allEdges, visibleEdges, themeColors, vs, hiddenIds, animation, leafId, isActive }: CanvasEdgesDeps): CanvasEdgesHandlers {
  // Track RF's live edge-selection so rebuilds (highlight/sync) don't wipe it.
  const selectedEdgeIdsRef = useRef<Set<string>>(new Set());

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<FewerEdge>[]) => {
      // Keep RF's live edge-selection so rebuilds (highlight/sync) don't wipe it.
      trackEdgeSelection(selectedEdgeIdsRef.current, changes);
      onEdgesChange(changes);
    },
    [onEdgesChange],
  );

  // One pass over the whole graph, memoised on the graph itself — it used to be
  // rebuilt on every selection change (30k nodes + 30k edges into two maps).
  const lookups = useMemo(() => buildTreeLookups(allNodes, allEdges), [allNodes, allEdges]);
  // Ids of symlink nodes — derived, never stored: symlink edges get their
  // contrast stroke + arrowhead from (node metadata, view settings) alone.
  const symlinkTargetIds = useMemo(
    () => {
      const out = new Set<string>();
      for (const n of allNodes) if (n.data?.symlink) out.add(n.id);
      return out;
    },
    [allNodes],
  );
  // The unhighlighted edge array: default stroke, global motion, edge type. It
  // depends on the edges and the styling, NOT on the selection, so a click
  // reuses it and only restyles the path edges.
  const baseEdges = useMemo(() => {
    const hidden = new Set(hiddenIds);
    return buildEdgeBase(
      visibleEdges.filter((e: FewerEdge) => !hidden.has(e.source) && !hidden.has(e.target)),
      themeColors,
      vs.edgeWidth,
      animation,
      symlinkTargetIds,
    ).map((e: FewerEdge) => ({ ...e, type: edgeTypeFor(vs.edgeStyle) }));
  }, [visibleEdges, hiddenIds, themeColors, vs.edgeWidth, animation, vs.edgeStyle, symlinkTargetIds]);

  useEffect(() => {
    const state = useGraphStore.getState();
    const leafSel = leafId ? state.leafSelections[leafId] : undefined;
    const selectedForHighlight = leafSel ?? state.selectedNodeIds;
    const hoverForHighlight = isActive ? state.hoverHighlightIds : [];
    setRfEdges(applyEdgeSelection(
      applyEdgeHighlights(baseEdges, selectedForHighlight, hoverForHighlight, lookups, themeColors, vs.edgeWidth, animation, symlinkTargetIds),
      selectedEdgeIdsRef.current,
    ));
  }, [graphVersion, selectionVersion, themeColors, vs.edgeWidth, vs.edgeStyle, animation, setRfEdges, baseEdges, lookups, leafId, isActive, symlinkTargetIds]);

  const dashArray = useMemo(() => staticEdgeDashArray(vs.edgeStrokeStyle), [vs.edgeStrokeStyle]);

  return { handleEdgesChange, dashArray, selectedEdgeIdsRef };
}