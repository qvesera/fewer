"use client";

// Re-export from the new slice-based store structure.
// This file exists for backward compatibility — all components import from here.
export { useGraphStore } from "./createStore";
export type { GraphState } from "./slices/types";