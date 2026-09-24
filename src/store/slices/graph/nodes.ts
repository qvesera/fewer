"use client";
// Nodes slice — thin composer over focused sub-modules.
// ADR a1214228: each file owns one concern; the composer keeps the public shape.
// Split from the former 464-line monolith (header: "Nodes bodies part 1: clipboard + delete + rename").
import type { StateCreator } from "zustand";
import type { GraphState } from "../types";
import { buildClipboardMethods } from "./nodes/clipboard";
import { buildDeletionMethods } from "./nodes/deletion";
import { buildRenameMethods } from "./nodes/rename";
import { buildCreationMethods } from "./nodes/creation";

export type NodesSliceCreator = StateCreator<GraphState, [], [], {
  clipboard: any;
  setClipboard: GraphState["setClipboard"];
  clearClipboard: GraphState["clearClipboard"];
  _makeCopyNode: GraphState["_makeCopyNode"];
  _duplicateSubtree: GraphState["_duplicateSubtree"];
  duplicateNodeUnderParent: GraphState["duplicateNodeUnderParent"];
  pasteNode: GraphState["pasteNode"];
  pasteFromClipboard: GraphState["pasteFromClipboard"];
  moveNode: GraphState["moveNode"];
  _findFreePositionForBounds: GraphState["_findFreePositionForBounds"];
  _findCreationPosition: GraphState["_findCreationPosition"];
  deleteNodes: GraphState["deleteNodes"];
  renameNode: GraphState["renameNode"];
  renameNodes: GraphState["renameNodes"];
  addNode: GraphState["addNode"];
  addStandaloneNode: GraphState["addStandaloneNode"];
  addParentNode: GraphState["addParentNode"];
  duplicateNode: GraphState["duplicateNode"];
}>;

export const createNodesSlice: NodesSliceCreator = (set, get) => ({
  ...buildClipboardMethods(set, get),
  ...buildDeletionMethods(set, get),
  ...buildRenameMethods(set, get),
  ...buildCreationMethods(set, get),
});
