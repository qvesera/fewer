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
  /** THIS VIEW'S HIDDEN IDS (T-219), as a Set. Cards derive visibility from
   *  it: a child is hidden ⇔ its id is in this set (it exists on the canvas or
   *  it doesn't — dangling edge targets count as hidden, matching the old
   *  `!visibleIds.has(id)` semantics for the edge-count badge).
   *
   *  Replaces the old `visibleIds: Set<string>` in the scope: that set was
   *  rebuilt (new identity) on EVERY store change — including every
   *  progressive-scan batch — so the context value changed and EVERY mounted
   *  card re-rendered per batch, no matter how narrow its store selectors
   *  were. The hidden set is content-stable (useStableHiddenIds upstream), so
   *  during a scan the scope identity holds and cards re-render only when
   *  their OWN children change. */
  hiddenIds: ReadonlySet<string>;
  /** Transient hover ring from the sidebar's Hidden Cards panel, as a Set.
   *  Was an array scanned with `includes` by every mounted card AND every
   *  rendered child row, so one hover cost O(rendered × ring size) — and a
   *  Hidden Children subtree can ring thousands of ids. One Set per canvas
   *  makes it O(1) per node and keeps the ring out of the store selectors. */
  hoverIds: Set<string>;
}

const GraphViewContext = createContext<GraphViewScope | null>(null);

export const GraphViewProvider = GraphViewContext.Provider;

/** Returns the per-view scope. Always non-null inside a canvas. */
export function useGraphViewScope(): GraphViewScope {
  return useContext(GraphViewContext)!;
}

/** Returns the direction from context (stable for CustomNode — no re-render on scope change). */
export function useGraphViewDirection(): LayoutDirection {
  const ctx = useContext(GraphViewContext);
  return ctx?.direction ?? "TB";
}