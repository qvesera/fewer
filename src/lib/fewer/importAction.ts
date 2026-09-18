/**
 * Step-3 dispatch for the unified 3-step import flow: maps the origin picked in
 * step 1 onto that origin's import action.
 *
 * Lives in its own module rather than in importFlow.ts (the shared contract)
 * because all four actions import importFlow — dispatching from there would be
 * a cycle.
 *
 * Plain async function: no React, no toasts. Caller surfaces the result.
 */
import type { ImportOptions } from "@/lib/fewer/importOptions";
import type { ImportActionResult, OriginSource } from "@/lib/fewer/importFlow";
import type { UrlImportContext } from "@/lib/fewer/importActionUrl";
import { runFolderImport } from "@/lib/fewer/importActionFolder";
import { runFileImport } from "@/lib/fewer/importActionFile";
import { runUrlImport } from "@/lib/fewer/importActionUrl";
import { runCloudImport } from "@/lib/fewer/importActionCloud";

/** What the dialog supplies from its hooks (use-github-import / use-watch). */
export interface ImportActionContext {
  /** From useImport(): fetches/parses the URL and writes the graph to the store. */
  importUrl: UrlImportContext["importUrl"];
  /** From useImport(): the hook's own last-run snapshot, read after the await. */
  getUrlResult: () => { error: string | null; truncated: boolean };
  /** From useWatch(): registers the URL for change watching. */
  watchUrl: (url: string) => Promise<boolean>;
}

export async function runImport(
  source: OriginSource,
  options: ImportOptions,
  ctx: ImportActionContext,
): Promise<ImportActionResult> {
  switch (source.origin) {
    case "folder":
      return await runFolderImport(options);
    case "file":
      return await runFileImport(source, options);
    case "cloud":
      return await runCloudImport(source, options);
    case "url": {
      const result = await runUrlImport(source, options, {
        importUrl: ctx.importUrl,
        getTruncated: () => ctx.getUrlResult().truncated,
        // Only register a watch when the user asked for one; the runner also
        // suppresses it for GitHub repos, which have their own change signal.
        watchUrl: source.watch ? ctx.watchUrl : undefined,
      });
      if (result.ok) return result;
      // The hook knows why the fetch failed (e.g. "no public index at that
      // URL") and the runner only has a generic message — prefer the hook's.
      const hookError = ctx.getUrlResult().error;
      return hookError ? { ...result, error: hookError } : result;
    }
  }
}