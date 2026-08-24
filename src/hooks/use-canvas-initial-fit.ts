import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { FewerNode } from "@/lib/fewer/types";
import { LAYOUT_DIMENSIONS } from "@/lib/fewer/layout";
import { useGraphStore } from "@/store/graphStore";

/**
 * Fit the view exactly once per loaded graph — when nodes first appear — and
 * never on relayout. React Flow's `fitView` boolean prop only fits at mount
 * (so an import that happens after the canvas mounts would never fit), and a
 * `graphVersion`-driven fitView would zoom/jump the user's viewport on every
 * relayout (parent/unparent, cut/paste, edge-style, beautify, …). Guarding on
 * "nodes went from empty to non-empty" gives a fit on initial load, and
 * resetting the guard when the canvas empties fits again on the next import.
 * The small delay lets the initial dimension-measure → relayout settle so the
 * fit targets real positions, not the raw stacked layout.
 *
 * We deliberately do NOT call React Flow's fitView() for the initial fit:
 * with onlyRenderVisibleElements, nodes outside the current viewport never
 * mount, so they are never measured — and fitView() computes its bounds from
 * measured nodes only. On a fresh load (viewport still at identity) a tall
 * graph has most nodes culled, so fitView() sees few/no measured nodes,
 * silently no-ops, and the canvas stays stuck at zoom 1 with the rest of the
 * graph culled offscreen. The store already knows every node's laid-out
 * position and type-aware size (LAYOUT_DIMENSIONS / nodeWidth/nodeHeight),
 * so compute the bounds ourselves and set the viewport directly.
 */
export function useCanvasInitialFit(
  visibleNodes: FewerNode[],
  containerRef: RefObject<HTMLDivElement | null>,
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void,
) {
  const didInitialFitRef = useRef(false);
  const fitTimerRef = useRef<number | null>(null);
  // NOTE: the pending timer deliberately survives dependency churn (the
  // measure→relayout pass right after load re-creates the `visibleNodes`
  // array). Clearing the timer in this effect's cleanup cancelled the fit
  // before it ever ran — the one-shot ref then blocked rescheduling.
  useEffect(() => {
    if (visibleNodes.length === 0) {
      didInitialFitRef.current = false;
      if (fitTimerRef.current !== null) { clearTimeout(fitTimerRef.current); fitTimerRef.current = null; }
      return;
    }
    if (didInitialFitRef.current || fitTimerRef.current !== null) return;
    didInitialFitRef.current = true;
    fitTimerRef.current = window.setTimeout(() => {
      fitTimerRef.current = null;
      const el = containerRef.current;
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
      const { nodeWidth, nodeHeight } = useGraphStore.getState();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of visibleNodes) {
        const w = n.measured?.width ?? n.width ?? nodeWidth;
        const h = n.measured?.height ?? n.height ?? (n.data.type === "folder" ? nodeHeight : LAYOUT_DIMENSIONS.height);
        minX = Math.min(minX, n.position.x);
        minY = Math.min(minY, n.position.y);
        maxX = Math.max(maxX, n.position.x + w);
        maxY = Math.max(maxY, n.position.y + h);
      }
      const bw = Math.max(1, maxX - minX);
      const bh = Math.max(1, maxY - minY);
      const padding = 0.2;
      // Same zoom clamp as the old fitView call (maxZoom 1.0, minZoom 0.35).
      const zoom = Math.min(1.0, Math.max(0.35, Math.min(
        (el.clientWidth * (1 - 2 * padding)) / bw,
        (el.clientHeight * (1 - 2 * padding)) / bh,
      )));
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      setViewport({
        x: el.clientWidth / 2 - cx * zoom,
        y: el.clientHeight / 2 - cy * zoom,
        zoom,
      });
    }, 120);
  }, [visibleNodes, setViewport]);
  // Clear the fit timer only on unmount.
  useEffect(() => () => { if (fitTimerRef.current !== null) clearTimeout(fitTimerRef.current); }, []);
}
