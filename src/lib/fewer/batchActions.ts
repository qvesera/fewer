import { useGraphStore } from "@/store/graphStore";

/** Minimal shape of the toast function menus pass in. */
export type BatchToast = (t: { title: string; description?: string }) => void;

export interface BatchAction {
  id: string;
  label: string;
  danger?: boolean;
  run: () => void;
}

const items = (n: number) => `${n} item${n === 1 ? "" : "s"}`;

/**
 * Single source of truth for multi-selection ("batch") actions. Every menu
 * that operates on a multi-node selection — the node context menus'
 * BatchActionsSection and the canvas selection-rect menu — builds its items
 * from here so they can never drift apart again.
 *
 * Handlers read live state via useGraphStore.getState() inside run(), so a
 * stale menu can't act on an old selection.
 */
export function buildBatchActions(opts: {
  toast: BatchToast;
  selectedIds: string[];
}): BatchAction[] {
  const { toast, selectedIds } = opts;
  const g = () => useGraphStore.getState();
  const ids = () => g().selectedNodeIds;

  const actions: BatchAction[] = [
    {
      id: "rename",
      label: "Rename…",
      run: () => window.dispatchEvent(new CustomEvent("fewer-batch-rename")),
    },
    {
      id: "copy",
      label: "Copy",
      run: () => {
        const list = ids();
        g().setClipboard("copy", list);
        toast({ title: "Copied", description: `${items(list.length)} copied` });
      },
    },
    {
      id: "cut",
      label: "Cut",
      run: () => {
        const s = g();
        const list = s.selectedNodeIds;
        s.setClipboard("cut", list);
        // Cut removes immediately (clipboard snapshot re-inserts on paste),
        // same as the single-node cut and Ctrl+X.
        s.deleteNodes(list);
        toast({ title: "Cut", description: `${items(list.length)} cut: paste to place` });
      },
    },
    {
      id: "duplicate",
      label: "Duplicate",
      run: () => {
        const s = g();
        for (const id of s.selectedNodeIds) s.duplicateNodeUnderParent(id);
        toast({
          title: "Duplicated",
          description: `${items(s.selectedNodeIds.length)} duplicated under same parent`,
        });
      },
    },
  ];

  actions.push(
    {
      id: "move-to-folder",
      label: "Move to Folder…",
      run: () => window.dispatchEvent(new CustomEvent("fewer-batch-parent")),
    },
    {
      id: "unparent",
      label: "Unparent",
      run: () => {
        const s = g();
        const list = s.selectedNodeIds;
        s.unparentNodes(list);
        toast({ title: "Unparented", description: `${items(list.length)} made root-level` });
      },
    },
    {
      id: "delete",
      label: `Delete ${selectedIds.length} Items`,
      danger: true,
      run: () => {
        const s = g();
        const n = s.selectedNodeIds.length;
        s.deleteNodes(s.selectedNodeIds);
        toast({ title: "Deleted", description: `${items(n)} deleted` });
      },
    },
  );

  return actions;
}
