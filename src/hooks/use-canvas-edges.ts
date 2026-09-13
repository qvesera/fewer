import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { EdgeChange } from "@xyflow/react";

import {
  applyEdgeSelection,
  buildSelectedEdgeHighlight,
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
  allNodes: FewerNode[];
  themeColors: EdgeThemeColors;
  vs: ResolvedViewSettings;
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
export function useCanvasEdges({ onEdgesChange, setRfEdges, graphVersion, allNodes, themeColors, vs, animation, leafId, isActive }: CanvasEdgesDeps): CanvasEdgesHandlers {
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

  useEffect(() => {
    const state = useGraphStore.getState();
    const leafSel = leafId ? state.leafSelections[leafId] : undefined;
    const selectedForHighlight = leafSel ?? state.selectedNodeIds;
    const hoverForHighlight = isActive ? state.hoverHighlightIds : [];
    const latestEdges = state.edges;
    const updatedEdges = buildSelectedEdgeHighlight(selectedForHighlight, hoverForHighlight, latestEdges, allNodes, themeColors, vs.edgeWidth, animation);
    const rfEdges = updatedEdges.map((e) => ({ ...e, type: edgeTypeFor(vs.edgeStyle) }));
    setRfEdges(applyEdgeSelection(rfEdges, selectedEdgeIdsRef.current).filter((e: FewerEdge) => {
      // Filter by the view's EFFECTIVE hidden set (layers + global), not just global.
      const hidden = new Set(vs.hiddenIds);
      return !hidden.has(e.source) && !hidden.has(e.target);
    }));
  }, [graphVersion, allNodes, themeColors, vs.edgeWidth, vs.edgeStyle, animation, setRfEdges, vs.hiddenIds, leafId, isActive]);

  const dashArray = useMemo(() => staticEdgeDashArray(vs.edgeStrokeStyle), [vs.edgeStrokeStyle]);

  return { handleEdgesChange, dashArray, selectedEdgeIdsRef };
}