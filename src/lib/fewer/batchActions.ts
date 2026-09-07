import { useGraphStore } from "@/store/graphStore";
import { countDescendants, pluralizeCount } from "./keyboardShortcuts";

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
    {
      id: "hide",
      label: "Hide",
      run: () => {
        const s = g();
        const list = s.selectedNodeIds;
        if (list.length === 0) return;
        const sub = countDescendants(list, s.edges);
        if (s.activeLeafId) s.hideNodesForLeaf(s.activeLeafId, list);
        else s.hideNodes(list);
        toast({
          title: "Cards hidden",
          description: `${pluralizeCount(list.length, "node")} hidden${sub > 0 ? ` (${pluralizeCount(sub, "subnode")})` : ""}: press Shift+H to restore`,
        });
      },
    },
    {
      id: "show",
      label: "Show",
      run: () => {
        const s = g();
        const hidden = s.hiddenIds;
        const list = s.selectedNodeIds.filter((id) => hidden.includes(id));
        if (list.length === 0) return;
        for (const id of list) s.showNode(id);
        toast({ title: "Cards shown", description: `${items(list.length)} revealed` });
      },
    },
    {
      id: "collapse",
      label: "Collapse Folders",
      run: () => {
        const s = g();
        const folders = s.selectedNodeIds.filter(
          (id) => s.nodes.find((n) => n.id === id)?.data.type === "folder",
        );
        if (folders.length === 0) return;
        let n = 0;
        for (const id of folders) {
          const node = s.nodes.find((nd) => nd.id === id);
          if (node && !node.data.collapsed) {
            s.toggleCollapse(id);
            n++;
          }
        }
        toast({ title: "Collapsed", description: `${items(n)} folder${n === 1 ? "" : "s"} collapsed` });
      },
    },
    {
      id: "expand",
      label: "Expand Folders",
      run: () => {
        const s = g();
        const folders = s.selectedNodeIds.filter(
          (id) => s.nodes.find((n) => n.id === id)?.data.type === "folder",
        );
        if (folders.length === 0) return;
        let n = 0;
        for (const id of folders) {
          const node = s.nodes.find((nd) => nd.id === id);
          if (node && node.data.collapsed) {
            s.toggleCollapse(id);
            n++;
          }
        }
        toast({ title: "Expanded", description: `${items(n)} folder${n === 1 ? "" : "s"} expanded` });
      },
    },
    {
      id: "copy-paths",
      label: "Copy Paths",
      run: () => {
        const s = g();
        const list = s.selectedNodeIds;
        if (list.length === 0) return;
        const paths = list
          .map((id) => s.nodes.find((n) => n.id === id)?.data.path)
          .filter((p): p is string => !!p)
          .join("\n");
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(paths).then(
            () => toast({ title: "Paths copied", description: `${items(list.length)} path${list.length === 1 ? "" : "s"} to clipboard` }),
            () => toast({ title: "Copy failed", description: "Clipboard unavailable" }),
          );
        } else {
          toast({ title: "Copy failed", description: "Clipboard unavailable" });
        }
      },
    },
    {
      id: "tags",
      label: "Tags…",
      run: () => window.dispatchEvent(new CustomEvent("fewer-batch-tags")),
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
