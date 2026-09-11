import fs from "fs/promises";
import path from "path";
import type { TreeEntry } from "./types";
import type { ImportOptions } from "./importOptions";
import { VENDORED_DIRS } from "./importOptions";

/**
 * Server-side directory walker for drag-and-drop fallbacks.
 *
 * Browsers that expose the dropped folder as a local path (portalized Chromium
 * builds on Flatpak/Snap deliver `text/uri-list`, never a directory item) let
 * the local dev server read the folder directly. Semantics mirror
 * buildTreeFromHandle so a drag import behaves exactly like a picker import.
 */
/** Extension filter for files, mirroring buildTreeFromHandle: files always pass
 *  the filter when includeFiles is off (they get marked hidden downstream) or
 *  when no extensions are configured. */
function isAllowedFile(fileName: string, options: ImportOptions): boolean {
  if (!options.includeFiles || options.extensions.length === 0) return true;
  const ext = fileName.split(".").pop() ?? "";
  const extToCompare = options.caseSensitiveExtensions ? ext : ext.toLowerCase();
  const allowedExts = options.caseSensitiveExtensions
    ? options.extensions
    : options.extensions.map((e) => e.toLowerCase());
  return allowedExts.includes(extToCompare);
}

export async function buildTreeFromPath(
  dirPath: string,
  depth: number,
  options: ImportOptions,
): Promise<TreeEntry> {
  const children: TreeEntry[] = [];

  // maxDepth 0 ("unlimited") is fine for the browser's sandboxed walk, but a
  // local fs walk of the ENTIRE disk tree would crawl forever — clamp it.
  const maxDepth = options.maxDepth === 0 ? MAX_DEPTH_CAP : options.maxDepth;
  const shouldRecurse = maxDepth === 0 || depth < maxDepth;

  if (shouldRecurse) {
    const dirents = await fs.readdir(dirPath, { withFileTypes: true });

    const dirs: string[] = [];
    const files: { name: string; path: string }[] = [];
    for (const dirent of dirents) {
      // Skip hidden files/folders if not included
      if (!options.includeHidden && dirent.name.startsWith(".")) continue;

      // Skip vendored directories if not included
      if (!options.includeVendored && VENDORED_DIRS.has(dirent.name)) continue;

      // Symlinks are skipped: a linked dir could loop forever (self-referencing
      // links are common in repos, e.g. bin → res/…/bin).
      if (dirent.isSymbolicLink()) continue;

      if (dirent.isDirectory()) {
        dirs.push(path.join(dirPath, dirent.name));
      } else if (dirent.isFile() && isAllowedFile(dirent.name, options)) {
        files.push({ name: dirent.name, path: path.join(dirPath, dirent.name) });
      }
    }

    // Filesystem calls are data-independent — parallelize the recursion and the
    // stats instead of awaiting each entry serially.
    const [childTrees, fileSizes] = await Promise.all([
      Promise.all(dirs.map((d) => buildTreeFromPath(d, depth + 1, options))),
      Promise.all(
        files.map(async (f) => {
          try {
            return (await fs.stat(f.path)).size;
          } catch {
            return 0;
          }
        }),
      ),
    ]);

    for (let i = 0; i < childTrees.length; i++) {
      // Same empty-folder semantics as buildTreeFromHandle.
      if (options.skipEmptyFolders && !childTrees[i]!.children?.length) continue;
      children.push(childTrees[i]!);
    }
    for (let i = 0; i < files.length; i++) {
      children.push({ name: files[i]!.name, type: "file", size: fileSizes[i]! });
    }
  }

  // Folders first, then alphabetical — same as buildTreeFromHandle.
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { name: path.basename(dirPath) || dirPath, type: "folder", children };
}

/** Hard ceiling for `maxDepth: 0` (unlimited) on a real fs walk. */
const MAX_DEPTH_CAP = 8;