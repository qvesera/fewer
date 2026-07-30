import { useState, useCallback } from "react";
import { useGraphStore } from "@/store/graphStore";
import { treeToGraph, filterTree } from "@/lib/fewer/treeToGraph";
import type { ImportOptions } from "@/lib/fewer/importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "@/lib/fewer/importOptions";

export function useGitHubImport() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importUrl = useCallback(async (url: string, options?: ImportOptions): Promise<boolean> => {
    if (!url.trim() || loading) return false;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/github-tree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to fetch repository");
      }

      const data = await res.json();
      const opts = options ?? DEFAULT_IMPORT_OPTIONS;
      const tree = opts.maxDepth > 0 || !opts.includeHidden || !opts.includeVendored || opts.skipEmptyFolders || opts.extensions.length > 0
        ? filterTree(data.tree, opts)
        : data.tree;
      if (!tree) return true; // everything filtered out, still "success"
      const { nodes, edges, hiddenFileIds } = treeToGraph(tree, { idPrefix: "github", includeFiles: opts.includeFiles });
      useGraphStore.getState().setGraph(nodes, edges, false, hiddenFileIds);
      useGraphStore.setState({ dataSource: `github:${data.repo}` });
      // Apply the currently selected edge flow style to the imported edges
      useGraphStore.getState().setEdgeStyle(useGraphStore.getState().edgeStyle);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      return false;
    } finally {
      setLoading(false);
    }
  }, [loading]);

  return { loading, error, setError, importUrl };
}
