"use client";
// Thin wrapper: graphSlice.ts was a 1371-line monolith. Bodies now live in
// ./graph/ (reveal, detach, core, nodes, structure, hideShow); this file keeps
// the public shape (GraphSliceCreator, createGraphSlice, helper re-exports)
// so createStore.ts, tests, and revealHelpers.ts keep working unchanged.
import type { GraphState } from "./types";
import { createCoreSlice, type CoreSliceCreator } from "./graph/core";
import { createNodesSlice, type NodesSliceCreator } from "./graph/nodes";
import { createStructureSlice, type StructureSliceCreator } from "./graph/structure";
import { createHideShowSlice, type HideShowSliceCreator } from "./graph/hideShow";

export { walkSubtreeReveal, collectShowSubtrees, reconcileAutoHide } from "./graph/reveal";
export { unparentSubtree } from "./graph/detach";

export type GraphSliceCreator = CoreSliceCreator &
  NodesSliceCreator &
  StructureSliceCreator &
  HideShowSliceCreator;

export const createGraphSlice: GraphSliceCreator = (set, get, api) => ({
  ...createCoreSlice(set as never, get as never, api as never),
  ...createNodesSlice(set as never, get as never, api as never),
  ...createStructureSlice(set as never, get as never, api as never),
  ...createHideShowSlice(set as never, get as never, api as never),
});

export type { GraphState };
