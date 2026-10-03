import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { OnSelectionChangeParams } from "@xyflow/react";

import { nextSelectionIds, selectionForLeaf } from "@/lib/fewer/canvasSelection";
import type { FewerNode } from "@/lib/fewer/types";
import { useGraphStore } from "@/store/graphStore";
import { isTauri } from "@/lib/fewer/nativeShell";
import { can } from "@/lib/fewer/tiers";
import { nodeAbsolutePath } from "@/lib/fewer/filePaths";
import { usePreviewStore } from "@/lib/fewer/previewStore";

export interface CanvasSelectionHandlers {
  /** Merge RF's live selection into the store (per-leaf aware). */
  onSelectionChange: (params: OnSelectionChangeParams) => void;
  /** Card click: write the selection directly — RF's report arrives after pointerup. */
  onNodeClick: (event: unknown, node: { id: string }) => void;
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
  /**
   * True while a pointer gesture is live in this canvas (CanvasInner tracks it).
   * React Flow's selection subscription is advisory — see onSelectionChange.
   */
  pointerActiveRef: { current: boolean };
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
export function useCanvasSelection({ setSelectedNodeIds, boxSelectBaseRef, selectedEdgeIdsRef, fitView, leafId, pointerActiveRef }: CanvasSelectionDeps): CanvasSelectionHandlers {
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

  /**
   * A card click writes the selection itself.
   *
   * React Flow's selection subscription fires *after* pointerup, so the gesture
   * gate above (rightly) treats that report as advisory and drops it — which
   * would leave the store empty while RF paints the clicked card. The click is
   * the one input we can observe synchronously and unambiguously, so it carries
   * the intent directly: a plain click selects the card, Shift adds to the
   * view's selection, Ctrl/Cmd toggles it off (the same semantics RF applies to
   * its own state). The lagging report then matches the store and is a no-op.
   */
  const onNodeClick = useCallback((_event: unknown, node: { id: string }) => {
    if (!leafId) return;
    const e = _event as { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean } | null;
    const state = useGraphStore.getState();
    const prev = selectionForLeaf(state.leafSelections, leafId, state.activeLeafId, state.selectedNodeIds);
    const next = e?.shiftKey
      ? (prev.includes(node.id) ? prev : [...prev, node.id])
      : (e?.metaKey || e?.ctrlKey)
        ? prev.filter((id) => id !== node.id)
        : [node.id];
    state.setSelectionForLeaf(leafId, next);
  }, [leafId]);

  // ── Selection: highlight ancestor path for EVERY selected node ──
  const onSelectionChange = useCallback(
    ({ nodes: selected, edges: selectedEdges }: OnSelectionChangeParams) => {
      const selectedIds = new Set(selected.map((n) => n.id));
      // Sync the live edge-selection ref from RF's selection snapshot
      // snapshot so the upcoming rebuild (and any later one) preserves it.
      selectedEdgeIdsRef.current = new Set(selectedEdges.filter((e) => e.selected).map((e) => e.id));
      // React Flow's selection subscription is ADVISORY. It re-emits whenever
      // this canvas pushes a new node array, and those echoes trail our own push
      // by a frame — the report describes the PREVIOUS stamp. Writing them into
      // the store made the selection oscillate: push [card], RF echoes [], push
      // [], RF echoes [card] — store -> canvas -> RF -> store until React hit its
      // 50-nested-update limit and tore the tree down (#285, splitting while a
      // card was selected). Only a pointer gesture in this canvas (click, box
      // select, drag) carries user intent; anything else is RF re-deriving the
      // bookkeeping for a stamp the store already owns.
      if (!pointerActiveRef.current && !dragSelectionRef.current) return;
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
    [setSelectedNodeIds, boxSelectBaseRef, selectedEdgeIdsRef, leafId, pointerActiveRef],
  );

  const onNodeDoubleClick = useCallback(
    (_: unknown, node: { id: string }) => {
      // Desktop shell + localPreview license: a file card opens the in-app
      // preview (T-091). Folders and unlicensed shells keep the zoom behavior.
      const st = useGraphStore.getState();
      const full = st.nodes.find((n) => n.id === node.id);
      if (
        full?.data.type === "file" &&
        full.data.path &&
        isTauri() &&
        can("localPreview", st.tier)
      ) {
        const root = st.nodes.find((n) => n.data.isRoot);
        const abs = nodeAbsolutePath(full.data.path, root?.data.path, st.localRootPath);
        if (abs) {
          usePreviewStore.getState().openPreview({
            nodeId: node.id,
            path: abs,
            name: full.data.label || full.data.path,
          });
          return;
        }
      }
      // A double-click selects the card itself, so the advisory report RF emits
      // around it no longer has to defend the selection (see the gate above).
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
    onSelectionChange, onNodeClick, onNodeDoubleClick, fitToSelection, selectAll,
    seedSelectionForDrag, endSelectionDrag,
  };
}