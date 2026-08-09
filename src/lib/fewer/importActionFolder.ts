/**
 * Folder import action — step 3 of the unified 3-step import flow.
 * Plain async function: no React, no toasts. Caller surfaces the result.
 * Ported from handleConfirmImport in FewerApp.tsx.
 */
import type { ImportOptions } from "@/lib/fewer/importOptions";
import type { ImportActionResult } from "@/lib/fewer/importFlow";
import { collectAutoHideNotes } from "@/lib/fewer/importFlow";
import { pickDirectoryTree } from "@/lib/fewer/fileSystem";
import { treeToGraph } from "@/lib/fewer/treeToGraph";
import { useGraphStore } from "@/store/graphStore";

export async function runFolderImport(
  options: ImportOptions,
): Promise<ImportActionResult> {
  try {
    const tree = await pickDirectoryTree(options);
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