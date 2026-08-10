"use client";

import type { StateCreator } from "zustand";
import type { GraphState } from "./types";
import type { LayoutDirection, EdgeStyle, EdgeStrokeStyle } from "@/lib/fewer/types";

export type LayoutSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    direction: LayoutDirection;
    edgeStyle: EdgeStyle;
    edgeAnimated: boolean;
    edgeStrokeStyle: EdgeStrokeStyle;
    edgeWidth: number;
    cornerRadius: number;
    nodeWidth: number;
    nodeHeight: number;

    setDirection: (d: LayoutDirection) => void;
    setEdgeStyle: (s: EdgeStyle) => void;
    setEdgeAnimated: (v: boolean) => void;
    setEdgeStrokeStyle: (s: EdgeStrokeStyle) => void;
    setEdgeWidth: (w: number) => void;
    setCornerRadius: (r: number) => void;
    setNodeDimensions: (w: number, h: number) => void;
  }
>;

export const createLayoutSlice: LayoutSliceCreator = (set, get) => ({
  direction: "TB",
  edgeStyle: "curved",
  edgeAnimated: false,
  edgeStrokeStyle: "solid",
  edgeWidth: 2,
  cornerRadius: 8,
  nodeWidth: 240,
  nodeHeight: 200,

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
    get().relayout();
  },

  setEdgeStyle: (style) => {
    set({ edgeStyle: style });
    const edgeType = style === "curved" ? "default" : style === "angled" ? "smoothstep" : "straight";
    set((s) => ({ edges: s.edges.map((e) => ({ ...e, type: edgeType as any })), graphVersion: s.graphVersion + 1 }));
  },

  setEdgeAnimated: (animated) => {
    if (animated && get().edgeStrokeStyle === "solid") {
      set({ edgeAnimated: animated, edgeStrokeStyle: "dashed" });
    } else {
      set({ edgeAnimated: animated });
    }
    set((s) => ({ edges: s.edges.map((e) => ({ ...e, animated })), graphVersion: s.graphVersion + 1 }));
  },

  setEdgeStrokeStyle: (strokeStyle) => {
    set({ edgeStrokeStyle: strokeStyle });
    const strokeDasharray = strokeStyle === "dashed" ? "8 4" : strokeStyle === "dotted" ? "2 4" : undefined;
    set((s) => ({
      edges: s.edges.map((e) => ({
        ...e,
        style: { ...e.style, ...(strokeDasharray ? { strokeDasharray } : { strokeDasharray: undefined }) },
      })),
      graphVersion: s.graphVersion + 1,
    }));
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
    setTimeout(() => get().relayout(), 50);
  },
});