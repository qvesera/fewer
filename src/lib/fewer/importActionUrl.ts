/**
 * URL import action — step 3 of the unified 3-step import flow.
 * Plain async function: no React, no toasts. Caller surfaces the result.
 * Ported from handleImport in ImportUrlDialog.tsx.
 */
import type { ImportOptions } from "@/lib/fewer/importOptions";
import type { ImportActionResult, OriginSource } from "@/lib/fewer/importFlow";
import { collectAutoHideNotes, isGitHubUrl } from "@/lib/fewer/importFlow";
import { useGraphStore } from "@/store/graphStore";

export interface UrlImportContext {
  /** From useImport() in "@/hooks/use-github-import"; already writes the graph into the store. */
  importUrl: (url: string, options?: ImportOptions) => Promise<boolean>;
  /** Read AFTER import resolves: whether the crawl hit its truncation limit. */
  getTruncated: () => boolean;
  /** Present when the user asked to watch this URL; returns success. */
  watchUrl?: (url: string) => Promise<boolean>;
}

export async function runUrlImport(
  source: Extract<OriginSource, { origin: "url" }>,
  options: ImportOptions,
  ctx: UrlImportContext,
): Promise<ImportActionResult> {
  try {
    const url = source.url.trim();
    if (!url) {
      return { ok: false, title: "Nothing to import", error: "Enter a URL first." };
    }

    const ok = await ctx.importUrl(url, options);
    if (!ok) {
      return {
        ok: false,
        title: "Import failed",
        error: "Could not fetch or parse the URL.",
      };
    }

    const nodeCount = useGraphStore.getState().nodes.length;
    // (graph store already written by ctx.importUrl)
    const notes: { title: string; description: string }[] = [];

    if (ctx.getTruncated()) {
      notes.push({
        title: "Crawl limit reached",
        description: "Showing first items only.",
      });
    }

    notes.push(...(await collectAutoHideNotes()));

    // The watch toggle hides for GitHub URLs; ignore a stale flag so editing
    // the URL to github.com after enabling watch never registers a watch.
    if (source.watch && ctx.watchUrl && !isGitHubUrl(url)) {
      const watched = await ctx.watchUrl(url);
      notes.push(
        watched
          ? {
              title: "Watching for changes",
              description: "You'll get a daily digest when this index changes.",
            }
          : { title: "Could not watch", description: "Watch setup failed." },
      );
    }

    return {
      ok: true,
      title: "Imported",
      description: `${nodeCount} node${nodeCount === 1 ? "" : "s"} loaded.`,
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