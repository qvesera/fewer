/**
 * File import action — step 3 of the unified 3-step import flow.
 * Plain async function: no React, no toasts. Caller surfaces the result.
 *
 * Unlike the old ImportFromFileDialog (which ignored import options),
 * this applies the shared ImportOptions via filterTree so the options
 * panel behaves identically for every origin.
 *
 * Lives apart from `importActionFile.ts`, which is a one-line re-export: bun's
 * `mock.module` registry is process-wide, and `importAction.test.ts` mocks that
 * path to assert origin dispatch. Keeping the implementation here means this
 * suite (fileOriginImport.test.ts) tests the real action instead of that spy
 * (T-145) — the hazard the repo's test-isolation rule warns about.
 */
import type { ImportOptions } from "@/lib/fewer/importOptions";
import type { ImportActionResult, ImportProgressFn, TextFileSource } from "@/lib/fewer/importFlow";
import { buildProgress, collectAutoHideNotes } from "@/lib/fewer/importFlow";
import { chunkTreeToGraph, filterTree } from "@/lib/fewer/treeToGraph";
import { parseGraphDocument } from "@/lib/fewer/localLibrary";
import { applySnapshot } from "@/lib/fewer/snapshot";
import { useGraphStore } from "@/store/graphStore";

export async function runFileImport(
  source: TextFileSource,
  options: ImportOptions,
  onProgress?: ImportProgressFn,
): Promise<ImportActionResult> {
  try {
    if (!source.content.trim()) {
      return {
        ok: false,
        title: "Nothing to import",
        error: "Provide structural script commands or load a file first.",
      };
    }

    onProgress?.({ phase: "Parsing file" });

    // A Fewer graph document (`.fwr`, or any payload carrying that envelope) is
    // a full SNAPSHOT: cards keep their ids, positions, tags and groups. It
    // bypasses the structural path — that one mints fresh ids, which would
    // orphan the group membership — and it ignores the import options, because
    // there is no tree to filter (T-145).
    const doc = parseGraphDocument(source.content);
    if (doc) {
      applySnapshot(doc.data, { source: "file" });
      const notes = await collectAutoHideNotes();
      return {
        ok: true,
        title: "Graph opened",
        description: `${doc.name}: ${doc.data.nodes.length} cards, positions, tags and groups restored`,
        notes,
      };
    }

    // Dynamic import keeps parsers out of the startup bundle (same as old dialog).
    const { parseImportFile } = await import("@/lib/fewer/parsers");
    const raw = parseImportFile(source.content, source.format, {
      csvMapping: source.csvMapping,
    });

    const tree = filterTree(raw, options);
    if (!tree) {
      return {
        ok: false,
        title: "Nothing to import",
        error: "All entries were filtered out by the import options.",
      };
    }

    const { nodes, edges, hiddenFileIds } = await chunkTreeToGraph(
      tree,
      {
        idPrefix: "file-import",
        includeFiles: options.includeFiles,
      },
      buildProgress(onProgress),
    );

    useGraphStore.setState({
      dataSource: "file",
      includeFiles: options.includeFiles,
      maxDisplayDepth: options.displayMaxDepth,
      localRootPath: null,
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
