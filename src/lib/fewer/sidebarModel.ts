/**
 * Pure model for the Sidebar (src/components/fewer/Sidebar.tsx).
 * Mirrors settingsModel.ts: UI-free helpers tested without a DOM.
 */
import type { AreaEditor } from "./panelLayout";

/** Which sidebar sections are visible (not docked out). */
export function visibleSidebarSections(opts: {
  dockedIds: Set<string>;
  nodeCount: number;
  tagCount: number;
  advancedModeEnabled: boolean;
}): Set<string> {
  const visible = new Set<string>();
  if (!opts.dockedIds.has("file")) visible.add("file");
  if (!opts.dockedIds.has("appearance")) visible.add("appearance");
  if (!opts.dockedIds.has("tags") && opts.nodeCount > 0) visible.add("tags");
  if (!opts.dockedIds.has("analytics") && opts.advancedModeEnabled && opts.nodeCount > 0) {
    visible.add("analytics");
  }
  return visible;
}

/** Hidden Cards badge count + visibility. */
export function hiddenSectionState(
  hiddenIds: string[],
  activeHiddenIds: string[] | undefined,
  activeShowFiles: boolean | undefined,
): { visible: boolean; count: number } {
  const active = activeHiddenIds !== undefined;
  const viewHiddenIds = active ? activeHiddenIds! : hiddenIds;
  const viewFiltersFiles = active ? activeShowFiles === false : false;
  return { visible: viewHiddenIds.length > 0 || viewFiltersFiles, count: viewHiddenIds.length };
}

/** Whether a section is draggable (takes nonDockableIds as param, no component import). */
export function sectionDraggable(
  id: AreaEditor,
  dockedIds: Set<string>,
  nonDockableIds: Set<string>,
): boolean {
  return !nonDockableIds.has(id) && !dockedIds.has(id);
}

/** Resolve the "new file/folder" target. */
export function newNodeTarget(
  selectedNodeIds: string[],
  nodes: { id: string; data: { type: string } }[],
  type: "file" | "folder",
): { parentId: string | null; name: string; label: string } {
  const parentId =
    selectedNodeIds.length === 1
      ? nodes.find((n) => n.id === selectedNodeIds[0] && n.data.type === "folder")?.id ?? null
      : null;
  const name = type === "file" ? "new-file.txt" : "New Folder";
  return {
    parentId,
    name,
    label: parentId ? `"${name}" added to folder` : `"${name}" added to canvas`,
  };
}

/** Edge-style choices for the sidebar. */
export const EDGE_STYLE_CHOICES = [
  { value: "curved" as const, label: "Curved" },
  { value: "straight" as const, label: "Straight" },
  { value: "angled" as const, label: "Angled" },
] as const;
