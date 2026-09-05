/**
 * Context providing per-view scope to all descendants inside a canvas.
 * Each canvas provides its resolved ViewSettings, leafId, and whether
 * this canvas is the "active" one (last clicked).
 */
"use client";

import { createContext, useContext } from "react";
import type { ResolvedViewSettings } from "@/lib/fewer/viewState";
import type { LayoutDirection } from "@/lib/fewer/types";

export interface GraphViewScope {
  leafId: string;
  isActive: boolean;
  direction: LayoutDirection;
  resolved: ResolvedViewSettings;
}

const GraphViewContext = createContext<GraphViewScope | null>(null);

export const GraphViewProvider = GraphViewContext.Provider;

/** Returns the per-view scope. Always non-null inside a canvas. */
export function useGraphViewScope(): GraphViewScope {
  return useContext(GraphViewContext)!;
}

/** Returns the direction from context (stable for CustomNode — no re-render on scope change). */
export function useGraphViewDirection(): string {
  const ctx = useContext(GraphViewContext);
  return ctx?.direction ?? "TB";
}