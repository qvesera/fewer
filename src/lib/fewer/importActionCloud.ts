/**
 * Cloud import action — step 3 of the unified 3-step import flow.
 * Plain async function: no React, no toasts. Caller surfaces the result.
 * Ported from handleImport in CloudBrowserDialog.tsx.
 */
import type { ImportOptions } from "@/lib/fewer/importOptions";
import type { ImportActionResult, OriginSource } from "@/lib/fewer/importFlow";
import { collectAutoHideNotes } from "@/lib/fewer/importFlow";
import { buildCloudTree } from "@/hooks/use-cloud";
import { filterTree, treeToGraph } from "@/lib/fewer/treeToGraph";
import { useGraphStore } from "@/store/graphStore";

export async function runCloudImport(
  source: Extract<OriginSource, { origin: "cloud" }>,
  options: ImportOptions,
): Promise<ImportActionResult> {
  try {
    if (!source.connectionId || !source.ref) {
      return {
        ok: false,
        title: "Nothing selected",
        error: "Pick a cloud folder first.",
      };
    }

    // Honor the shared scan-depth option. 0 = unlimited on the panel, but the
    // provider API needs a bound — 10 covers the slider's full range.
    const depth = options.maxDepth > 0 ? options.maxDepth : 10;
    const raw = await buildCloudTree(
      source.connectionId,
      source.provider,
      source.ref,
      depth,
    );
    if (!raw) throw new Error("Empty tree");

    const tree = filterTree(raw, options);
    if (!tree) {
      return {
        ok: false,
        title: "Nothing to import",
        error: "All entries were filtered out by the import options.",
      };
    }

    const { nodes, edges, hiddenFileIds } = treeToGraph(tree, {
      idPrefix: `cloud-${source.provider}`,
      includeFiles: options.includeFiles,
    });

    useGraphStore.setState({
      dataSource: `cloud:${source.provider}`,
      maxDisplayDepth: options.displayMaxDepth,
    });
    useGraphStore.getState().setGraph(nodes, edges, false, hiddenFileIds);

    const notes = await collectAutoHideNotes();

    return {
      ok: true,
      title: "Imported from cloud",
      description: `${source.name || tree.name}: ${nodes.length} entries`,
      notes,
    };
  } catch (err) {
    return {
      ok: false,
      title: "Import failed",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}