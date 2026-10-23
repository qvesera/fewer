import type { ImportActionResult } from "./importFlow";
import { runFolderImport } from "./importActionFolder";
import { forgetFolder } from "./recentFolders";
import { useGraphStore } from "@/store/graphStore";

/**
 * Re-open a folder root by absolute path (T-199): the one-click path behind
 * "Recent Folders". Walks the directory through the shell's list_dir bridge —
 * the same reader the picker and an OS drop use — so a recent folder and a
 * freshly picked one produce identical graphs. A folder that no longer opens
 * (deleted, unmounted) is dropped from the list instead of lingering.
 */
export async function openRecentFolder(path: string): Promise<ImportActionResult> {
  const result = await runFolderImport(useGraphStore.getState().importOptions, { kind: "path", path });
  if (!result.ok && !result.cancelled) forgetFolder(path);
  return result;
}