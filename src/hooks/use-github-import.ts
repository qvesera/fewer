import { useState, useCallback } from "react";
import { useGraphStore } from "@/store/graphStore";
import { treeToGraph, filterTree } from "@/lib/fewer/treeToGraph";
import type { ImportOptions } from "@/lib/fewer/importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "@/lib/fewer/importOptions";

function isGitHubUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "github.com";
  } catch {
    return false;
  }
}

export function useImport() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  /**
   * Import a directory graph from a GitHub repo URL or a public file index URL.
   * GitHub URLs hit /api/github-tree; everything else hits /api/crawl.
   */
  const importUrl = useCallback(
    async (url: string, options?: ImportOptions): Promise<boolean> => {
      if (!url.trim() || loading) return false;
      setLoading(true);
      setError(null);

      try {
        const endpoint = isGitHubUrl(url.trim())
          ? "/api/github-tree"
          : "/api/crawl";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to import URL");
        }

        const data = await res.json();
        setTruncated(!!data.truncated);
        const opts = options ?? DEFAULT_IMPORT_OPTIONS;
        const tree =
          opts.maxDepth > 0 ||
          !opts.includeHidden ||
          !opts.includeVendored ||
          opts.skipEmptyFolders ||
          opts.extensions.length > 0
            ? filterTree(data.tree, opts)
            : data.tree;
        if (!tree) return true; // everything filtered out, still "success"
        const { nodes, edges, hiddenFileIds } = treeToGraph(tree, {
          idPrefix: isGitHubUrl(url.trim()) ? "github" : "crawl",
          includeFiles: opts.includeFiles,
        });
        useGraphStore.setState({
          dataSource: `url:${url.trim()}`,
          maxDisplayDepth: opts.displayMaxDepth,
        });
        useGraphStore.getState().setGraph(nodes, edges, false, hiddenFileIds);
        // Apply the currently selected edge flow style to the imported edges
        useGraphStore.getState().setEdgeStyle(useGraphStore.getState().edgeStyle);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [loading]
  );

  return { loading, error, setError, importUrl, truncated };
}