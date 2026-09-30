import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { OnSelectionChangeParams } from "@xyflow/react";

import { nextSelectionIds } from "@/lib/fewer/canvasSelection";
import type { FewerNode } from "@/lib/fewer/types";
import { useGraphStore } from "@/store/graphStore";

export interface CanvasSelectionHandlers {
  /** Merge RF's live selection into the store (per-leaf aware). */
  onSelectionChange: (params: OnSelectionChangeParams) => void;
  /** Double-click: guard the selection from RF's stale snapshot + zoom to node. */
  onNodeDoubleClick: (event: unknown, node: { id: string }) => void;
  /** Zoom to the current selection (or fit the whole graph when empty). */
  fitToSelection: () => void;
  /** Select every node (store + RF canvas). */
  selectAll: () => void;
  /** Claim the store's selection for a drag that is about to begin. */
  seedSelectionForDrag: (ids: string[]) => void;
  /** The drag ended — stop defending its selection against RF reports. */
  endSelectionDrag: () => void;
}

export interface CanvasSelectionDeps {
  setSelectedNodeIds: (ids: string[]) => void;
  /** Set while an additive Shift+drag box select is in flight. */
  boxSelectBaseRef: { current: Set<string> | null };
  /** Live RF edge-selection ref (owned by useCanvasEdges). */
  selectedEdgeIdsRef: { current: Set<string> };
  fitView: (opts: { nodes?: Array<{ id: string }>; duration?: number; padding?: number; maxZoom?: number }) => void;
  leafId?: string | null;
}

/**
 * Canvas selection behaviors: RF snapshot merging, the double-click guard,
 * fit-to-selection, and select-all.
 *
 * NOTE: we intentionally do NOT write store edges in `onSelectionChange`.
 * Writing edges would change the store's edge array, re-triggering the
 * edge-highlight effect and causing an infinite onSelectionChange ↔ effect
 * loop. That effect handles both RF-edge highlighting and store-edge sync on
 * every selection / graphVersion / theme change instead.
 */
export function useCanvasSelection({ setSelectedNodeIds, boxSelectBaseRef, selectedEdgeIdsRef, fitView, leafId }: CanvasSelectionDeps): CanvasSelectionHandlers {
  // Protect double-click selection from being cleared by the subsequent onSelectionChange.
  const doubleClickedIdRef = useRef<string | null>(null);

  // What React Flow selected when the live drag began. A drag must keep its
  // highlight: until the store has this view's own selection, the canvas paints
  // the dragged card unselected on its next push, React Flow reports an empty
  // selection back, and store → canvas → React Flow → store repeats until React
  // gives up with "Maximum update depth exceeded" — the #281 crash, which only
  // happened when the drag was the FIRST interaction (clicking a card first
  // leaves `leafSelections[leafId]` populated and the write becomes a no-op).
  const dragSelectionRef = useRef<string[] | null>(null);

  const seedSelectionForDrag = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      dragSelectionRef.current = ids;
      if (leafId) useGraphStore.getState().setSelectionForLeaf(leafId, ids);
      else setSelectedNodeIds(ids);
    },
    [setSelectedNodeIds, leafId],
  );

  const endSelectionDrag = useCallback(() => { dragSelectionRef.current = null; }, []);

  // ── Selection: highlight ancestor path for EVERY selected node ──
  const onSelectionChange = useCallback(
    ({ nodes: selected, edges: selectedEdges }: OnSelectionChangeParams) => {
      const selectedIds = new Set(selected.map((n) => n.id));
      // If a double-click just selected a node, ensure it stays selected
      // even if RF's onSelectionChange reports a stale/empty selection.
      if (doubleClickedIdRef.current) {
        selectedIds.add(doubleClickedIdRef.current);
        doubleClickedIdRef.current = null;
      }
      // Sync the live edge-selection ref from RF's authoritative full-selection
      // snapshot so the upcoming rebuild (and any later one) preserves it.
      selectedEdgeIdsRef.current = new Set(selectedEdges.filter((e) => e.selected).map((e) => e.id));
      const prevIds = useGraphStore.getState().selectedNodeIds;
      const base = boxSelectBaseRef.current;
      // Mid-drag, an empty report means "the canvas painted the card unselected",
      // not "the user deselected" — keep the drag's selection (see dragSelectionRef).
      const newIds = nextSelectionIds({
        prevIds, selected, selectedIds, base,
        dragSelection: dragSelectionRef.current,
      });
      // Write to per-leaf selection (and global for keyboard shortcut compatibility)
      if (leafId) {
        useGraphStore.getState().setSelectionForLeaf(leafId, newIds);
      } else {
        setSelectedNodeIds(newIds);
      }
    },
        [setSelectedNodeIds, boxSelectBaseRef, selectedEdgeIdsRef, leafId],
  );

  const onNodeDoubleClick = useCallback(
    (_: unknown, node: { id: string }) => {
      doubleClickedIdRef.current = node.id;
      useGraphStore.getState().setSelectedNodeIds([node.id]);
      requestAnimationFrame(() => fitView({ nodes: [{ id: node.id }], duration: 600, padding: 0.3, maxZoom: 1.5 }));
    },
    [fitView],
  );

  const fitToSelection = useCallback(() => {
    const selected = useGraphStore.getState().selectedNodeIds;
    if (selected.length === 0) { fitView({ duration: 600, padding: 0.2 }); return; }
    fitView({ nodes: selected.map((id: string) => ({ id })), duration: 600, padding: 0.3 });
  }, [fitView]);

  const selectAll = useCallback(() => {
    // The canvas stamps the `selected` flags from the id list, so selecting
    // everything is just the id list — no node array rewrite.
    const ids = useGraphStore.getState().nodes.map((n: FewerNode) => n.id);
    useGraphStore.setState({ selectedNodeIds: ids });
  }, []);

  return {
    onSelectionChange, onNodeDoubleClick, fitToSelection, selectAll,
    seedSelectionForDrag, endSelectionDrag,
  };
}