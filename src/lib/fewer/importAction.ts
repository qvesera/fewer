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
import { scopeOptionsToOrigin, type ImportOptions } from "@/lib/fewer/importOptions";
import type { ImportProgressFn, ImportActionResult, OriginSource } from "@/lib/fewer/importFlow";
import type { UrlImportContext } from "@/lib/fewer/importActionUrl";
import { runFolderImport } from "@/lib/fewer/importActionFolder";
import { runFileImport } from "@/lib/fewer/importActionFile";
import { runArchiveImport } from "@/lib/fewer/importActionArchive";
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
  onProgress?: ImportProgressFn,
): Promise<ImportActionResult> {
  // ONE seam for every origin: an option that cannot act on this source's
  // scope is forced to its no-op value before any action sees it. Without
  // this, a scan concept (depth, hidden files, extensions, empty folders)
  // silently rewrites content the user pasted — the persisted maxDepth of 6
  // truncated a re-imported JSON export, and a dotfile filter dropped its
  // .github folder — and a preference saved for one origin leaked into
  // another. See RELEVANT_OPTIONS in importOptions.ts for the full matrix.
  const scopedOptions = scopeOptionsToOrigin(options, source);

  switch (source.origin) {
    case "folder":
      return await runFolderImport(scopedOptions, undefined, onProgress);
    case "file":
      // Archive is no longer its own origin, but it still has its own reader:
      // branch on the payload kind and reuse both actions verbatim.
      return source.kind === "archive"
        ? await runArchiveImport({ file: source.file, name: source.name }, scopedOptions, onProgress)
        : await runFileImport(source, scopedOptions, onProgress);
    case "cloud":
      return await runCloudImport(source, scopedOptions, onProgress);
    case "url": {
      const result = await runUrlImport(source, scopedOptions, {
        importUrl: ctx.importUrl,
        getTruncated: () => ctx.getUrlResult().truncated,
        // Only register a watch when the user asked for one; the runner also
        // suppresses it for GitHub repos, which have their own change signal.
        watchUrl: source.watch ? ctx.watchUrl : undefined,
      }, onProgress);
      if (result.ok) return result;
      // The hook knows why the fetch failed (e.g. "no public index at that
      // URL") and the runner only has a generic message — prefer the hook's.
      const hookError = ctx.getUrlResult().error;
      return hookError ? { ...result, error: hookError } : result;
    }
  }
}