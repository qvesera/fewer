"use client";

import type { StateCreator } from "zustand";
import type { GraphState } from "./types";
import type { LayoutDirection, EdgeStyle, EdgeStrokeStyle } from "@/lib/fewer/types";
import { edgeDashPattern } from "@/lib/fewer/types";

export type LayoutSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    direction: LayoutDirection;
    edgeStyle: EdgeStyle;
    edgeAnimated: boolean;
    /**
     * Animate only the ancestor-path edges of selected nodes. Standalone: it
     * implies animation is on for the selection path, whether or not
     * `edgeAnimated` is set. When both are on, this controls the selected
     * path; `edgeAnimated` drives the non-selected edges.
     */
    edgeAnimatedSelectedOnly: boolean;
    edgeStrokeStyle: EdgeStrokeStyle;
    /** Dash pattern for the animated selected-path edges only (dashed | dotted) — owned by Settings. */
    edgeAnimatedStrokeStyle: EdgeStrokeStyle;
    edgeWidth: number;
    cornerRadius: number;
    nodeWidth: number;
    nodeHeight: number;
    /** Crown-shyness intensity: 0 = flat gaps, 1 = default, max 3. Read by
     *  relayout, so a change applies the next time Rearrange runs. */
    shynessScale: number;

    setDirection: (d: LayoutDirection) => void;
    setEdgeStyle: (s: EdgeStyle) => void;
    setEdgeAnimated: (v: boolean) => void;
    setEdgeAnimatedSelectedOnly: (v: boolean) => void;
    setEdgeStrokeStyle: (s: EdgeStrokeStyle) => void;
    setEdgeAnimatedStrokeStyle: (s: EdgeStrokeStyle) => void;
    setEdgeWidth: (w: number) => void;
    setCornerRadius: (r: number) => void;
    setNodeDimensions: (w: number, h: number) => void;
    setShynessScale: (scale: number) => void;
  }
>;

/**
 * Responsive default layout direction: LR on screens smaller than 1.5k
 * (2560×1440) so the wide LR layout better fits the available horizontal
 * space, TB otherwise. Returns TB when there is no window (SSR/build).
 * The store initializes to the isomorphic "TB" to avoid an SSR/client
 * hydration mismatch; the Sidebar applies this responsive default once on
 * the client (see Sidebar). Saved graphs / the sidebar control can override.
 */
export function defaultDirection(): LayoutDirection {
  if (typeof window !== "undefined") {
    const { width, height } = window.screen;
    if (width > 0 && height > 0 && (width < 2560 || height < 1440)) return "LR";
  }
  return "TB";
}

export const createLayoutSlice: LayoutSliceCreator = (set, get) => ({
  // Isomorphic default — the responsive LR default is applied client-side in
  // the Sidebar so SSR and hydration render the same initial state.
  direction: "TB",
  edgeStyle: "angled",
  edgeAnimated: false,
  edgeAnimatedSelectedOnly: false,
  edgeStrokeStyle: "solid",
  edgeAnimatedStrokeStyle: "dashed",
  edgeWidth: 2,
  cornerRadius: 8,
  nodeWidth: 240,
  nodeHeight: 200,
  shynessScale: 1,

  setDirection: (direction) => {
    set({ direction });
    const edgeTypeMap: Record<string, string> = { curved: "default", angled: "smoothstep", straight: "straight" };
    const currentStyle = get().edgeStyle;
    set((s) => ({
      edges: s.edges.map((e) => ({
        ...e,
        id: `e-${e.source}-${e.target}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: edgeTypeMap[currentStyle] as any,
      })),
    }));
    // No automatic relayout: nodes keep their positions and edges re-route to
    // the new handle sides. Re-layout runs only via the Rearrange button/shortcut.
  },

  setEdgeStyle: (style) => {
    set({ edgeStyle: style });
    const edgeType = style === "curved" ? "default" : style === "angled" ? "smoothstep" : "straight";
    set((s) => ({ edges: s.edges.map((e) => ({ ...e, type: edgeType as any })), graphVersion: s.graphVersion + 1 }));
  },

  setEdgeAnimated: (animated) => {
    set({ edgeAnimated: animated });
    set((s) => ({
      // Motion toggle: with "Animate Selected Edges Only" on this drives only
      // the NON-selected edges (the selected path always animates in its own
      // dialog-chosen pattern). Patterns use the base style; the canvas
      // edge-styling effect re-derives selected-path animated dashes.
      edges: s.edges.map((e) => {
        const dash = edgeDashPattern(s.edgeStrokeStyle);
        return { ...e, animated, style: { ...e.style, ...(dash ? { strokeDasharray: dash } : { strokeDasharray: undefined }) } };
      }),
      graphVersion: s.graphVersion + 1,
    }));
  },

  // Flips the flag only: per-edge animated/dash values are recomputed by the
  // canvas edge-styling effect (it knows the selection). Only the Settings
  // dialog owns this toggle.
  setEdgeAnimatedSelectedOnly: (selectedOnly) => {
    set((s) => ({ edgeAnimatedSelectedOnly: selectedOnly, graphVersion: s.graphVersion + 1 }));
  },

  setEdgeStrokeStyle: (strokeStyle) => {
    set({ edgeStrokeStyle: strokeStyle });
    set((s) => ({
      // Applies to all edges; the canvas effect re-derives selected-path
      // animated dashes via the graphVersion bump (the dialog pattern wins for
      // highlighted edges when "Animate Selected Edges Only" is on).
      edges: s.edges.map((e) => {
        const dash = edgeDashPattern(strokeStyle);
        return { ...e, style: { ...e.style, ...(dash ? { strokeDasharray: dash } : { strokeDasharray: undefined }) } };
      }),
      graphVersion: s.graphVersion + 1,
    }));
  },

  // Dash pattern for the animated SELECTED-path edges only (dashed | dotted),
  // owned solely by the Settings dialog. The canvas edge-styling effect applies
  // it to the highlighted edges; the graphVersion bump re-runs that effect.
  setEdgeAnimatedStrokeStyle: (strokeStyle) => {
    set((s) => ({ edgeAnimatedStrokeStyle: strokeStyle, graphVersion: s.graphVersion + 1 }));
  },

  setEdgeWidth: (width) => {
    const clamped = Math.max(0.5, Math.min(6, width));
    set({ edgeWidth: clamped });
    set((s) => ({ edges: s.edges.map((e) => ({ ...e, style: { ...e.style, strokeWidth: clamped } })), graphVersion: s.graphVersion + 1 }));
  },

  setCornerRadius: (radius) => {
    const clamped = Math.max(0, Math.min(20, radius));
    set({ cornerRadius: clamped });
    set((s) => ({ edges: s.edges.map((e) => ({ ...e, pathOptions: { borderRadius: clamped } })), graphVersion: s.graphVersion + 1 }));
  },

  setNodeDimensions: (w, h) => {
    const newW = Math.max(120, w);
    const newH = Math.max(40, h);
    const { nodes } = get();
    const updatedNodes = nodes.map((n) => ({
      ...n,
      style: { ...n.style, width: newW, height: n.data.type === "folder" ? newH : undefined, minHeight: undefined },
      measured: undefined,
    }));
    set({ nodeWidth: newW, nodeHeight: newH, nodes: updatedNodes, graphVersion: get().graphVersion + 1 });
  },

  setShynessScale: (scale) => {
    const clamped = Math.max(0, Math.min(3, scale));
    if (clamped === get().shynessScale) return;
    // No automatic relayout — the new intensity is picked up on the next
    // explicit Rearrange (relayout reads shynessScale from the store).
    set({ shynessScale: clamped });
  },
});