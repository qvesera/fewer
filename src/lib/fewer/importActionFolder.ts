/**
 * Folder import action — step 3 of the unified 3-step import flow.
 * Plain async function: no React, no toasts. Caller surfaces the result.
 * Ported from handleConfirmImport in FewerApp.tsx.
 */
import type { ImportOptions } from "@/lib/fewer/importOptions";
import type { ImportActionResult, ImportProgressFn } from "@/lib/fewer/importFlow";
import { buildProgress, collectAutoHideNotes } from "@/lib/fewer/importFlow";
import { pickDirectoryTree } from "@/lib/fewer/fileSystem";
import {
  buildTreeFromEntry,
  buildTreeFromHandle,
  setStoredRootHandle,
} from "@/lib/fewer/fileSystem";
import { chunkTreeToGraph } from "@/lib/fewer/treeToGraph";
import { resolveRootLocalPath } from "@/lib/fewer/fileOps";
import type { TreeEntry } from "@/lib/fewer/types";
import type { DroppedDirectorySource } from "@/lib/fewer/dropImport";
import { useGraphStore } from "@/store/graphStore";
import { isHost, nativeListDir, nativePickDirectory } from "@/lib/fewer/nativeShell";
import { buildTreeFromNative } from "@/lib/fewer/nativeTree";
/** Produce the tree for a dropped folder through whichever channel delivered it. */
async function treeFromDropped(
  source: DroppedDirectorySource,
  options: ImportOptions,
): Promise<TreeEntry | null> {
  switch (source.kind) {
    case "handle":
      setStoredRootHandle(source.handle);
      return await buildTreeFromHandle(source.handle, 0, options);
    case "entry":
      return await buildTreeFromEntry(source.entry, 0, options);
  }
}

/** Ask the local dev server to walk a dropped directory path (applies the same
 * ImportOptions the browser-side walk would). Falls back to browser drag APIs. */
async function fetchLocalTree(
  dirPath: string,
  options: ImportOptions,
): Promise<TreeEntry | null> {
  const res = await fetch("/api/list-directory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: dirPath, options }),
  });
  const json = await res.json().catch(() => null) as { tree?: TreeEntry | null; error?: string } | null;
  if (!res.ok) {
    throw new Error(json?.error ?? `Server returned ${res.status}`);
  }
  return json?.tree ?? null;
}

/**
 * @param options Saved import settings from the store.
 * @param dropped Optional pre-obtained directory (e.g. from a native
 *   drag-and-drop). When provided the native folder picker is skipped.
 * @param onProgress Optional live progress (phase + done/total when known).
 */
export async function runFolderImport(
  options: ImportOptions,
  dropped?: DroppedDirectorySource,
  onProgress?: ImportProgressFn,
): Promise<ImportActionResult> {
  try {
    // Desktop shell: ALWAYS walk via the shell's list_dir RPC. Import is a
    // core capability (plan: desktop free = import + canvas), and the
    // webview fallback (<input webkitdirectory>) presents a file-only chooser
    // in WebKitGTK — no folder selection at all (reported 2026-10-03). The
    // native dialog is folder-only and the walk needs no server. Absolute
    // paths survive, so localRootPath is known exactly and Open-in-Explorer /
    // saved graphs resolve without a filesystem search.
    const nativeAllowed = isHost();
    let tree: TreeEntry | null = null;
    let nativeRoot: string | null = null;
    if (dropped) {
      tree = await treeFromDropped(dropped, options);
    } else if (nativeAllowed) {
      const rootPath = await nativePickDirectory();
      if (!rootPath) return { ok: false, cancelled: true, title: "Import cancelled" };
      nativeRoot = rootPath;
      tree = await buildTreeFromNative(rootPath, options, nativeListDir, (phase) =>
        onProgress?.({ phase }),
      );
    } else {
      tree = await pickDirectoryTree(options, undefined, onProgress);
    }
    if (!tree) {
      return { ok: false, cancelled: true, title: "Import cancelled" };
    }

    const { nodes, edges, hiddenFileIds } = await chunkTreeToGraph(
      tree,
      { includeFiles: options.includeFiles },
      buildProgress(onProgress),
    );

    useGraphStore.setState({
      dataSource: "directory",
      includeFiles: options.includeFiles,
      maxDisplayDepth: options.displayMaxDepth,
    });
    useGraphStore.getState().setGraph(nodes, edges, false, hiddenFileIds);
    if (nativeRoot) useGraphStore.getState().setLocalRootPath(nativeRoot);

    // Resolve the imported root to its absolute path on the dev machine once,
    // so later opens (and saved graphs) use it directly instead of searching.
    onProgress?.({ phase: "Finishing up" });
    await resolveRootLocalPath();

    const notes = await collectAutoHideNotes();

    // "Look Inside Archives": tell the user what was expanded, and why
    // anything was not. The walkers own the bytes, so they report via
    // takeLastExpansion().
    if (options.expandArchives) {
      const { takeLastExpansion, expandNotes } = await import("./archiveExpand");
      const expansion = takeLastExpansion();
      if (expansion && expansion.expanded > 0) {
        notes.push({
          title: `Expanded ${expansion.expanded} archive${expansion.expanded === 1 ? "" : "s"}`,
          description: `${expansion.members.toLocaleString()} entries read from inside the folder.`,
        });
      }
      if (expansion) notes.push(...expandNotes(expansion));
    }

    return {
      ok: true,
      title: "Directory loaded",
      description: `${tree.name}: ${nodes.length} entries`,
      notes,
    };
  } catch (err) {
    return {
      ok: false,
      title: "Could not open directory",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}