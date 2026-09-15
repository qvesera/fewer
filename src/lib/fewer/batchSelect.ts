import type { FewerNode, FewerEdge } from "./types";
import { getDescendants } from "./validation";
import { useGraphStore } from "@/store/graphStore";

/**
 * Pure selection helpers for the canvas selection-rect menu. Each function
 * computes a new selection list from current state and returns it; the caller
 * applies it via setSelectedNodeIds. Keeping them pure makes them trivial to
 * unit-test without a store.
 */

export interface SelectAction {
  id: string;
  label: string;
  run: () => void;
}

/**
 * Shared Select section items used by both the canvas selection-rect menu
 * (GraphCanvas) and the node context menu (BatchActionsSection in CustomNode).
 * Keeps the two menus in sync from one source.
 */
export function buildSelectActions(selectedIds: string[]): SelectAction[] {
  return [
    {
      id: "select-descendants",
      label: "Select Descendants",
      run: () => useGraphStore.getState().setSelectedNodeIds(selectDescendants(selectedIds, useGraphStore.getState().edges)),
    },
    {
      id: "select-same-extension",
      label: "Select Same Extension",
      run: () => useGraphStore.getState().setSelectedNodeIds(selectSameExtension(useGraphStore.getState().nodes, selectedIds)),
    },
    {
      id: "select-same-category",
      label: "Select Same Category",
      run: () => useGraphStore.getState().setSelectedNodeIds(selectSameCategory(useGraphStore.getState().nodes, selectedIds)),
    },
  ];
}

/** Union of every selected node plus all of its descendants (subtree). */
export function selectDescendants(
  selectedIds: string[],
  edges: FewerEdge[],
): string[] {
  const set = new Set(selectedIds);
  for (const id of selectedIds) {
    for (const d of getDescendants(id, edges)) set.add(d);
  }
  return [...set];
}

/** Distinct values of a string key present in the current selection. */
function distinctValues(
  nodes: FewerNode[],
  selectedIds: string[],
  key: "extension" | "category",
): string[] {
  const seen = new Set<string>();
  for (const id of selectedIds) {
    const v = nodes.find((n) => n.id === id)?.data[key];
    if (v) seen.add(v);
  }
  return [...seen];
}

/** Every node whose `extension` matches one found in the selection. */
export function selectSameExtension(
  nodes: FewerNode[],
  selectedIds: string[],
): string[] {
  const exts = new Set(distinctValues(nodes, selectedIds, "extension"));
  if (exts.size === 0) return selectedIds;
  return nodes.filter((n) => n.data.extension && exts.has(n.data.extension)).map((n) => n.id);
}

/** Every node whose `category` matches one found in the selection. */
export function selectSameCategory(
  nodes: FewerNode[],
  selectedIds: string[],
): string[] {
  const cats = new Set(distinctValues(nodes, selectedIds, "category"));
  if (cats.size === 0) return selectedIds;
  return nodes.filter((n) => n.data.category && cats.has(n.data.category)).map((n) => n.id);
}

/** Every node carrying the given tag id (`node.data.tagIds`). */
export function selectByTag(nodes: FewerNode[], tagId: string): string[] {
  return nodes
    .filter((n) => (n.data.tagIds ?? []).includes(tagId))
    .map((n) => n.id);
}
