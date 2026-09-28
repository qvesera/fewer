/**
 * Archive import action — step 3 of the unified 3-step import flow.
 * Plain async function: no React, no toasts. Caller surfaces the result.
 *
 * Reads the archive's listing only, then applies the shared ImportOptions
 * exactly like the file import does.
 */
import type { ImportOptions } from "@/lib/fewer/importOptions";
import type { ImportActionResult, OriginSource } from "@/lib/fewer/importFlow";
import { collectAutoHideNotes, importFailure } from "@/lib/fewer/importFlow";
import { formatBytes } from "@/lib/fewer/stats";
import { filterTree, treeToGraph } from "@/lib/fewer/treeToGraph";
import { useGraphStore } from "@/store/graphStore";

export async function runArchiveImport(
  source: Extract<OriginSource, { origin: "archive" }>,
  options: ImportOptions,
): Promise<ImportActionResult> {
  if (!source.file) {
    return {
      ok: false,
      title: "Nothing to import",
      error: "Choose an archive file first.",
    };
  }

  try {
    // Dynamic import keeps the parser out of the startup bundle (same as
    // runFileImport's parsers import).
    const { listArchive, MAX_ARCHIVE_ENTRIES } = await import(
      "@/lib/fewer/archiveList"
    );
    const listing = await listArchive(source.file);

    const tree = filterTree(listing.tree, options);
    if (!tree) {
      return {
        ok: false,
        title: "Nothing to import",
        error: "All entries were filtered out by the import options.",
      };
    }

    const { nodes, edges, hiddenFileIds } = treeToGraph(tree, {
      idPrefix: "archive-import",
      includeFiles: options.includeFiles,
    });

    useGraphStore.setState({
      dataSource: "file",
      includeFiles: options.includeFiles,
      maxDisplayDepth: options.displayMaxDepth,
      localRootPath: null,
    });
    useGraphStore.getState().setGraph(nodes, edges, false, hiddenFileIds);

    const notes = await collectAutoHideNotes();
    if (listing.truncated) {
      const cap = MAX_ARCHIVE_ENTRIES.toLocaleString();
      notes.unshift({
        title: "Archive listing truncated",
        description: `The archive holds more than ${cap} entries — the first ${cap} were imported.`,
      });
    }

    return {
      ok: true,
      title: "Graph built from archive",
      description: `${source.name} (${formatBytes(source.file.size)}): ${nodes.length} entries`,
      notes,
    };
  } catch (err) {
    return importFailure(err, "Archive import failed");
  }
}