/**
 * Context providing the resolved layout direction for the current graph view.
 * Each canvas wraps its ReactFlow in a provider; CustomNode reads from this
 * context for handle positions instead of the global direction store.
 */
"use client";

import { createContext, useContext } from "react";
import type { LayoutDirection } from "@/lib/fewer/types";

const GraphViewContext = createContext<LayoutDirection>("TB");

export const GraphViewProvider = GraphViewContext.Provider;

export function useGraphViewDirection(): LayoutDirection {
  return useContext(GraphViewContext);
}