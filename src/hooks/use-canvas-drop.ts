import { useCallback } from "react";
import type { DragEvent } from "react";
import { droppedPathOf, readFewerChildPayload } from "@/lib/fewer/dropImport";
import { LOCAL_FS_FEATURES } from "@/lib/fewer/features";
import { hostFilePathForDrop, nativeListDir, nativeOpenPath } from "@/lib/fewer/nativeShell";
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
 * Handle three drop paths on the canvas:
 *  1. An intra-canvas Few­er payload (a child node dragged from its parent card)
 *     → either expand the folder from disk (if a directory handle is attached
 *     and drop-to-expand is enabled) or create a standalone node.
 *  2. An OS-dropped file/folder in the desktop shell (T-122) → the preload
 *     bridge resolves the File to an absolute path; a folder becomes the graph,
 *     a file opens in the OS's default app.
 *  3. An external native file/folder drop on an empty canvas (web) → open the
 *     system folder picker and import the directory tree.
 *
 *  ⚠️ Do NOT iterate `dataTransfer.items` or call item-level methods
 *  (getAsFileSystemHandle, webkitGetAsEntry, getAsString, …). On portalized /
 *  sandboxed Chromium builds (Vivaldi Flatpak, Brave, some Windows) ANY
 *  item-level access can crash the renderer process. Path 2 reads `files`
 *  instead, and only ever runs inside the shell's own packaged Chromium.
 */
export function useCanvasDrop({ screenToFlowPosition, addStandaloneNode, toast }: DropDeps) {
  /**
   * T-122: an absolute path dropped from the OS. `list_dir` resolves for a
   * directory only, so one cheap probe decides folder vs file without adding a
   * host command: a folder becomes the graph, a file goes to the OS opener.
   */
  const openDroppedPath = useCallback(
    async (path: string) => {
      const store = useGraphStore.getState();

      let isFolder = true;
      try {
        await nativeListDir(path, 0, 1);
      } catch {
        isFolder = false;
      }

      if (!isFolder) {
        try {
          await nativeOpenPath(path);
          toast({ title: "Opened with the default app", description: path });
        } catch {
          toast({ title: "Could not open the dropped file", description: path, variant: "destructive" });
        }
        return;
      }

      // Dropping a folder means loading it as the graph. The shell restores the
      // last graph on launch, so the canvas is rarely empty — ask before replacing.
      // ponytail: window.confirm is the cheap option; the upgrade path is a host
      // `confirm` command backed by Electron's dialog.showMessageBox.
      if (store.nodes.length > 0 && !window.confirm("Replace the current canvas with the dropped folder?")) {
        return;
      }

      store.setLoading(true);
      try {
        const { runFolderImport } = await import("@/lib/fewer/importActionFolder");
        const result = await runFolderImport(store.importOptions, { kind: "path", path });
        if (result.ok) {
          toast({ title: result.title, description: result.description });
          result.notes?.forEach((n) => toast({ title: n.title, description: n.description }));
        } else if (!result.cancelled) {
          toast({ title: result.title, description: result.error, variant: "destructive" });
        }
      } catch (err) {
        console.warn("[fewer] drop import failed", err);
        toast({ title: "Import failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      } finally {
        store.setLoading(false);
      }
    },
    [toast],
  );

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

      // 2) OS drop in the desktop shell: resolve the dropped File to an absolute
      //    path through the preload bridge, then import the folder (or open the
      //    file). Never runs on web — dragDropImport is off there, so
      //    `dataTransfer.files` is only read in our own packaged Chromium.
      if (LOCAL_FS_FEATURES.dragDropImport) {
        const droppedPath = droppedPathOf(event.dataTransfer.files, hostFilePathForDrop);
        if (droppedPath) {
          await openDroppedPath(droppedPath);
          return;
        }
      }

      // External native drop on the empty canvas → open the system folder picker
      // (safe on every platform — no DataTransfer item access that could crash).
      // Shell builds never reach this: path 2 resolves above. It stays as the
      // degraded path when a host exposes no filePath helper.
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
