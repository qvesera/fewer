/**
 * File import action — step 3 of the unified 3-step import flow.
 * Plain async function: no React, no toasts. Caller surfaces the result.
 *
 * Unlike the old ImportFromFileDialog (which ignored import options),
 * this applies the shared ImportOptions via filterTree so the options
 * panel behaves identically for every origin.
 */
import type { ImportOptions } from "@/lib/fewer/importOptions";
import type { ImportActionResult, OriginSource } from "@/lib/fewer/importFlow";
import { collectAutoHideNotes } from "@/lib/fewer/importFlow";
import { filterTree, treeToGraph } from "@/lib/fewer/treeToGraph";
import { useGraphStore } from "@/store/graphStore";

export async function runFileImport(
  source: Extract<OriginSource, { origin: "file" }>,
  options: ImportOptions,
): Promise<ImportActionResult> {
  try {
    if (!source.content.trim()) {
      return {
        ok: false,
        title: "Nothing to import",
        error: "Provide structural script commands or load a file first.",
      };
    }

    // Dynamic import keeps parsers out of the startup bundle (same as old dialog).
    const { parseImportFile } = await import("@/lib/fewer/parsers");
    const raw = parseImportFile(source.content, source.format);

    const tree = filterTree(raw, options);
    if (!tree) {
      return {
        ok: false,
        title: "Nothing to import",
        error: "All entries were filtered out by the import options.",
      };
    }

    const { nodes, edges, hiddenFileIds } = treeToGraph(tree, {
      idPrefix: "file-import",
      includeFiles: options.includeFiles,
    });

    useGraphStore.setState({
      dataSource: "file",
      includeFiles: options.includeFiles,
      maxDisplayDepth: options.displayMaxDepth,
    });
    useGraphStore.getState().setGraph(nodes, edges, false, hiddenFileIds);

    const notes = await collectAutoHideNotes();

    return {
      ok: true,
      title: "Graph built from file",
      description: `${tree.name}: ${nodes.length} entries`,
      notes,
    };
  } catch (err) {
    return {
      ok: false,
      title: "Import failed",
      error:
        err instanceof Error
          ? err.message
          : "Failed parsing file payload structural rules.",
    };
  }
}