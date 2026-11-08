"use client";

import { useCallback, useMemo, useRef } from "react";
import { Panel, useReactFlow, useStore, type PanelPosition } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import type { CSSProperties } from "react";
import { buildMinimapGeometry, viewportMaskPath } from "@/lib/fewer/minimapPath";
import type { FewerNode } from "@/lib/fewer/types";

/**
 * Minimap painted as three `<path>` elements instead of one React component
 * per node (T-225).
 *
 * Replaces React Flow's `<MiniMap>`, which mounted `n` components with `n`
 * store subscriptions — 4 507 rects / ~123k listeners / 74 % of the DOM on a
 * 5k document, and ~190k elements at 25k (the A/B exonerated it as the script
 * wall — that was the canvas force-mount, `rfInternals.ts` — but the per-node
 * cost stands). Here the geometry is three path strings from
 * `buildMinimapGeometry`, so the DOM cost is constant; the only
 * store subscription left is RF's own transform/size (needed for the viewport
 * rect and pan/zoom).
 *
 * Controlled by design: `nodes` is the canvas's stamped node array — the exact
 * per-view, per-position, selection-flagged list RF itself was handed — so a
 * split view paints its own layout and hidden nodes never leak in. Nothing is
 * read from the global store.
 *
 * Coordinates: the `<svg>` uses the graph bounds as its `viewBox`, so paths are
 * raw flow coordinates and `vector-effect="non-scaling-stroke"` keeps hairlines
 * screen-width. Pointer input inverts through `getScreenCTM`, which is exact
 * under any `preserveAspectRatio` letterboxing.
 *
 * Interaction parity with `<MiniMap pannable zoomable>`: drag pans, wheel
 * zooms about the viewport centre. Keyboard users get the same powers from
 * `CanvasZoomControls`, so the map stays pointer-only (as before).
 *
 * Painting parity is the other half (T-247): the rewrite kept the colors of the
 * old `<MiniMap nodeColor nodeStrokeColor>` call but not its semantics, so the
 * map came out as a wireframe — 2px non-scaling outlines on chips small enough
 * that the outline was all you could see, the viewport drawn as a bare orange
 * rectangle that hugs the panel at fit-zoom, and selection painted in the same
 * orange as folders. Chips are FILLS (default no stroke), selection and the
 * viewport share the selection accent, and the dim sheet outside the viewport —
 * `viewportMaskPath` — is what tells you where you are looking. Keeping it as
 * ONE path keeps the T-239 cost profile: three chip paths + at most two more.
 */
interface GraphMinimapProps {
  /** The canvas's stamped nodes (post layout, per-view positions, selection). */
  nodes: readonly FewerNode[];
  position: PanelPosition;
  style?: CSSProperties;
  /** Theme ACCENT for folder chips (folderIcon), not the pale card body. */
  folderColor: string;
  /** Theme ACCENT for file chips (fileIcon). */
  fileColor: string;
  /** Selected chips and the viewport outline — distinct from both accents. */
  selectionColor: string;
  /**
   * Solid colour to dim with — pass the theme's `--background` token. Alpha is
   * fixed in the component (`MASK_OPACITY`), so the value stays a plain colour.
   */
  maskColor: string;
  /** Chip fill alpha. */
  chipOpacity?: number;
  /** Chip outline in screen px; 0 = no outline (the readable default). */
  strokeWidth?: number;
  ariaLabel?: string;
}

/** Fraction of empty frame around the graph so cards are not flush to the edge. */
const FRAME_PADDING = 0.06;
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 3;
/**
 * How much the background shows through the dim sheet: chips outside the
 * viewport fade toward the panel's own background rather than disappearing.
 * (React Flow's default `maskColor` sat at the same ~0.6 range.)
 */
const MASK_OPACITY = 0.55;

export function GraphMinimap({
  nodes,
  position,
  style,
  folderColor,
  fileColor,
  selectionColor,
  maskColor,
  chipOpacity = 0.7,
  strokeWidth = 0,
  ariaLabel = "Mini map",
}: GraphMinimapProps) {
  const { setViewport } = useReactFlow();
  const { transform, width: rfWidth, height: rfHeight } = useStore(
    (s) => ({ transform: s.transform, width: s.width, height: s.height }),
    shallow,
  );

  const geo = useMemo(() => buildMinimapGeometry(nodes), [nodes]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  /** Flow point under the cursor + viewport at drag start → relative delta pan. */
  const dragRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const width = Number(style?.width) || 200;
  const height = Number(style?.height) || 150;

  // Frame: graph bounds expanded by a padding fraction, aspect-preserved by
  // the svg's letterboxing (so a square panel never stretches the graph).
  const frame = useMemo(() => {
    const bw = Math.max(1, geo.bounds.maxX - geo.bounds.minX);
    const bh = Math.max(1, geo.bounds.maxY - geo.bounds.minY);
    const px = bw * FRAME_PADDING;
    const py = bh * FRAME_PADDING;
    return {
      x: geo.bounds.minX - px,
      y: geo.bounds.minY - py,
      width: bw + px * 2,
      height: bh + py * 2,
      minX: geo.bounds.minX,
      minY: geo.bounds.minY,
      maxX: geo.bounds.maxX,
      maxY: geo.bounds.maxY,
    };
  }, [geo.bounds]);

  /** Client point → flow coordinates, via the svg's own user-space matrix. */
  const flowPointAt = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const p = flowPointAt(e.clientX, e.clientY);
      if (!p) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { x: p.x, y: p.y, vx: transform[0], vy: transform[1] };
    },
    [flowPointAt, transform],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const p = flowPointAt(e.clientX, e.clientY);
      if (!p) return;
      const zoom = transform[2];
      // Flow delta follows the cursor 1:1 → same feel as RF's pannable map.
      setViewport({
        x: drag.vx - (p.x - drag.x) * zoom,
        y: drag.vy - (p.y - drag.y) * zoom,
        zoom,
      });
    },
    [flowPointAt, transform, setViewport],
  );

  const endDrag = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  }, []);

  // Zoom about the viewport centre (the wheel cursor is over the map, not the
  // canvas, so anchoring there would teleport the view).
  const onWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      const zoom = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, transform[2] * (e.deltaY < 0 ? 1.1 : 1 / 1.1)),
      );
      const fx = (rfWidth / 2 - transform[0]) / transform[2];
      const fy = (rfHeight / 2 - transform[1]) / transform[2];
      setViewport({ x: rfWidth / 2 - fx * zoom, y: rfHeight / 2 - fy * zoom, zoom });
    },
    [transform, rfWidth, rfHeight, setViewport],
  );

  // The viewport rect is clamped to the frame: a deep zoom still leaves a
  // marker at the edge instead of the rectangle vanishing entirely.
  const viewRect = useMemo(() => {
    const [tx, ty, zoom] = transform;
    const vx = -tx / zoom;
    const vy = -ty / zoom;
    const x = Math.max(vx, frame.minX);
    const y = Math.max(vy, frame.minY);
    const right = Math.min(vx + rfWidth / zoom, frame.maxX);
    const bottom = Math.min(vy + rfHeight / zoom, frame.maxY);
    if (right <= x || bottom <= y) return null;
    return { x, y, width: right - x, height: bottom - y };
  }, [transform, rfWidth, rfHeight, frame]);

  if (geo.drawn === 0) return null;

  // The dim sheet and the viewport outline come as a pair: an empty mask means
  // there is no window to point at (no viewport, or it covers the frame at
  // fit-zoom), and that is exactly the case where an outline degenerated into a
  // border around the whole panel.
  const frameRect = { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
  const maskPath = viewportMaskPath(frameRect, viewRect);

  return (
    <Panel position={position} style={style} aria-label={ariaLabel}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={ariaLabel}
        className="react-flow__minimap"
        style={{ display: "block", cursor: "grab", borderRadius: 12, touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
      >
        <path d={geo.files} fill={fileColor} fillOpacity={chipOpacity} stroke={strokeWidth ? fileColor : "none"} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        <path d={geo.folders} fill={folderColor} fillOpacity={chipOpacity} stroke={strokeWidth ? folderColor : "none"} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        <path d={geo.selected} fill={selectionColor} fillOpacity={1} stroke={strokeWidth ? selectionColor : "none"} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        {maskPath && (
          <path
            d={maskPath}
            fill={maskColor}
            fillOpacity={MASK_OPACITY}
            fillRule="evenodd"
            pointerEvents="none"
          />
        )}
        {viewRect && maskPath && (
          <rect
            x={viewRect.x}
            y={viewRect.y}
            width={viewRect.width}
            height={viewRect.height}
            fill="none"
            stroke={selectionColor}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </Panel>
  );
}

