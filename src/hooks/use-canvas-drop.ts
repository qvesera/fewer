import { useCallback } from "react";
import type { DragEvent } from "react";
import { readFewerChildPayload } from "@/lib/fewer/dropImport";
import { LOCAL_FS_FEATURES } from "@/lib/fewer/features";
import { useGraphStore } from "@/store/graphStore";
import type { FewerNode } from "@/lib/fewer/types";

interface ScreenPosition { x: number; y: number }
type ToastFn = (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void

interface DropDeps {
  screenToFlowPosition: (p: ScreenPosition) => ScreenPosition;
  addStandaloneNode: (label: string, type: "folder" | "file", position: ScreenPosition) => void;
  toast: ToastFn;
}

/**
 * Handle two drop paths on the canvas:
 *  1. An intra-canvas Few­er payload (a child node dragged from its parent card)
 *     → either expand the folder from disk (if a directory handle is attached
 *     and drop-to-expand is enabled) or create a standalone node.
 *  2. An external native file/folder drop on an empty canvas → open the system
 *     folder picker and import the directory tree.
 *
 *  ⚠️ Do NOT iterate `dataTransfer.items` or call item-level methods
 *  (getAsFileSystemHandle, webkitGetAsEntry, getAsString, …). On portalized /
 *  sandboxed Chromium builds (Vivaldi Flatpak, Brave, some Windows) ANY
 *  item-level access can crash the renderer process.
 */
export function useCanvasDrop({ screenToFlowPosition, addStandaloneNode, toast }: DropDeps) {
  const onDrop = useCallback(
    async (event: DragEvent) => {
      const payload = readFewerChildPayload(event.dataTransfer);
      event.preventDefault();

      if (payload) {
        try {
          const { label, type, parentId } = JSON.parse(payload);
          const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
                    const { draggedFolderHandle } = await import("../components/fewer/CustomNode");
          const handle = draggedFolderHandle as FileSystemDirectoryHandle | null;
          const { expandFolderNode } = await import("@/lib/fewer/fileOps");
          if (handle && handle.kind === "directory" && LOCAL_FS_FEATURES.dropToExpand) {
            await expandFolderNode(label, parentId, position, handle, useGraphStore.getState() as any);
            toast({ title: "Folder expanded", description: `"${label}" and its contents loaded from disk` });
          } else {
            addStandaloneNode(label, type, position);
            toast({ title: "Node created", description: `"${label}" dropped onto canvas` });
          }
        } catch { /* internal drop parse failure — ignore */ }
        return;
      }

      // External native drop on the empty canvas → open the system folder picker
      // (safe on every platform — no DataTransfer item access that could crash).
      if (useGraphStore.getState().nodes.length > 0 || !LOCAL_FS_FEATURES.dragDropImport) return;

      const store = useGraphStore.getState();
      store.setLoading(true);
      try {
        const { pickDirectoryTree } = await import("@/lib/fewer/fileSystem");
        const tree = await pickDirectoryTree(store.importOptions);
        if (!tree) { toast({ title: "Import cancelled", variant: "destructive" }); return; }
        const { treeToGraph } = await import("@/lib/fewer/treeToGraph");
        const { nodes, edges, hiddenFileIds } = treeToGraph(tree, { includeFiles: store.importOptions.includeFiles });
        useGraphStore.setState({ dataSource: "directory", includeFiles: store.importOptions.includeFiles, maxDisplayDepth: store.importOptions.displayMaxDepth });
        useGraphStore.getState().setGraph(nodes, edges, false, hiddenFileIds);
        const { resolveRootLocalPath } = await import("@/lib/fewer/fileOps");
        await resolveRootLocalPath();
        const { collectAutoHideNotes } = await import("@/lib/fewer/importFlow");
        const notes = await collectAutoHideNotes();
        toast({ title: "Directory loaded", description: `${tree.name}: ${nodes.length} entries` });
        notes?.forEach((n) => toast({ title: n.title, description: n.description }));
      } catch (err) {
        console.warn("[fewer] drop import failed", err);
        toast({ title: "Import failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      } finally {
        store.setLoading(false);
      }
    },
    [screenToFlowPosition, addStandaloneNode, toast],
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  // Re-exported so the parent's `n` type annotation stays accurate.
  void (null as unknown as FewerNode);

  return { onDrop, onDragOver };
}
