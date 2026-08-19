import { useState, useCallback, useRef } from "react";
import { useGraphStore } from "@/store/graphStore";
import { treeToGraph, filterTree } from "@/lib/fewer/treeToGraph";
import type { ImportOptions } from "@/lib/fewer/importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "@/lib/fewer/importOptions";
import { isGitHubUrl } from "@/lib/fewer/importFlow";

export interface UrlImportSnapshot {
  error: string | null;
  truncated: boolean;
}

export function useImport() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  // Synchronous snapshot — state updates only land after re-render, but the
  // unified import flow reads these in the same tick `importUrl` resolves.
  const snapshotRef = useRef<UrlImportSnapshot>({ error: null, truncated: false });

  /**
   * Import a directory graph from a GitHub repo URL or a public file index URL.
   * GitHub URLs hit /api/github-tree; everything else hits /api/crawl.
   */
  const importUrl = useCallback(
    async (url: string, options?: ImportOptions): Promise<boolean> => {
      // Reset FIRST so even guard-return paths never expose stale data.
      snapshotRef.current = { error: null, truncated: false };
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
        snapshotRef.current.truncated = !!data.truncated;
        const opts = options ?? DEFAULT_IMPORT_OPTIONS;
        const tree =
          opts.maxDepth > 0 ||
          !opts.includeHidden ||
          !opts.includeVendored ||
          opts.skipEmptyFolders ||
          opts.extensions.length > 0
            ? filterTree(data.tree, opts)
            : data.tree;
        if (!tree) {
          const msg = "All entries were filtered out by the import options.";
          setError(msg);
          snapshotRef.current.error = msg;
          return false;
        }
        const { nodes, edges, hiddenFileIds } = treeToGraph(tree, {
          idPrefix: isGitHubUrl(url.trim()) ? "github" : "crawl",
          includeFiles: opts.includeFiles,
        });
        useGraphStore.setState({
          dataSource: `url:${url.trim()}`,
          maxDisplayDepth: opts.displayMaxDepth,
          localRootPath: null,
        });
        useGraphStore.getState().setGraph(nodes, edges, false, hiddenFileIds);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        snapshotRef.current.error = msg;
        return false;
      } finally {
        setLoading(false);
      }
    },
    [loading]
  );

  /** Sync read of the last import's error/truncated — safe in the same tick. */
  const getResult = useCallback((): UrlImportSnapshot => snapshotRef.current, []);

  return { loading, error, setError, importUrl, truncated, getResult };
}
