"use client";
// Thin wrapper: the former 740-line monolith is split into focused sub-slices
// under ./ui/. This file re-exports the combined shape so createStore.ts and
// every consumer keep working unchanged.
import type { GraphState } from "./types";
import { createSearchSlice, type SearchSliceCreator } from "./ui/searchSlice";
import { createSelectionSlice, type SelectionSliceCreator } from "./ui/selectionSlice";
import { createVisibilitySlice, type VisibilitySliceCreator } from "./ui/visibilitySlice";
import { createFolderSlice, type FolderSliceCreator } from "./ui/folderSlice";
import { createCollapseSlice, type CollapseSliceCreator } from "./ui/collapseSlice";
import { createPanelUiSlice, type PanelUiSliceCreator } from "./ui/panelUiSlice";
import { createDialogsSlice, type DialogsSliceCreator } from "./ui/dialogsSlice";

export type UiSliceCreator = SearchSliceCreator &
  SelectionSliceCreator &
  VisibilitySliceCreator &
  FolderSliceCreator &
  CollapseSliceCreator &
  PanelUiSliceCreator &
  DialogsSliceCreator;

export const createUiSlice: UiSliceCreator = (set, get, api) => ({
  ...createSearchSlice(set as never, get as never, api as never),
  ...createSelectionSlice(set as never, get as never, api as never),
  ...createVisibilitySlice(set as never, get as never, api as never),
  ...createFolderSlice(set as never, get as never, api as never),
  ...createCollapseSlice(set as never, get as never, api as never),
  ...createPanelUiSlice(set as never, get as never, api as never),
  ...createDialogsSlice(set as never, get as never, api as never),
});

export type { GraphState };
