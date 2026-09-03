/**
 * Folder import action — step 3 of the unified 3-step import flow.
 * Plain async function: no React, no toasts. Caller surfaces the result.
 * Ported from handleConfirmImport in FewerApp.tsx.
 */
import type { ImportOptions } from "@/lib/fewer/importOptions";
import type { ImportActionResult } from "@/lib/fewer/importFlow";
import { collectAutoHideNotes } from "@/lib/fewer/importFlow";
import { pickDirectoryTree } from "@/lib/fewer/fileSystem";
import {
  buildTreeFromEntry,
  buildTreeFromHandle,
  setStoredRootHandle,
} from "@/lib/fewer/fileSystem";
import { treeToGraph } from "@/lib/fewer/treeToGraph";
import { resolveRootLocalPath } from "@/lib/fewer/fileOps";
import type { TreeEntry } from "@/lib/fewer/types";
import type { DroppedDirectorySource } from "@/lib/fewer/dropImport";
import { useGraphStore } from "@/store/graphStore";
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
 */
export async function runFolderImport(
  options: ImportOptions,
  dropped?: DroppedDirectorySource,
): Promise<ImportActionResult> {
  try {
    const tree = dropped
      ? await treeFromDropped(dropped, options)
      : await pickDirectoryTree(options);
    if (!tree) {
      return { ok: false, cancelled: true, title: "Import cancelled" };
    }

    const { nodes, edges, hiddenFileIds } = treeToGraph(tree, {
      includeFiles: options.includeFiles,
    });

    useGraphStore.setState({
      dataSource: "directory",
      includeFiles: options.includeFiles,
      maxDisplayDepth: options.displayMaxDepth,
    });
    useGraphStore.getState().setGraph(nodes, edges, false, hiddenFileIds);

    // Resolve the imported root to its absolute path on the dev machine once,
    // so later opens (and saved graphs) use it directly instead of searching.
    await resolveRootLocalPath();

    const notes = await collectAutoHideNotes();

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