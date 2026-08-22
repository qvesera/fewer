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

    for (const dirent of dirents) {
      // Skip hidden files/folders if not included
      if (!options.includeHidden && dirent.name.startsWith(".")) continue;

      // Skip vendored directories if not included
      if (!options.includeVendored && VENDORED_DIRS.has(dirent.name)) continue;

      // Symlinks are skipped: a linked dir could loop forever (self-referencing
      // links are common in repos, e.g. bin → res/…/bin).
      if (dirent.isSymbolicLink()) continue;

      const fullPath = path.join(dirPath, dirent.name);

      if (dirent.isDirectory()) {
        const childTree = await buildTreeFromPath(fullPath, depth + 1, options);
        // Same empty-folder semantics as buildTreeFromHandle.
        if (options.skipEmptyFolders && !childTree.children?.length) continue;
        children.push(childTree);
      } else if (dirent.isFile()) {
        // Files are always included (as buildTreeFromHandle does) even when
        // includeFiles is false — treeToGraph marks them hidden instead.
        if (options.includeFiles && options.extensions.length > 0) {
          const ext = dirent.name.split(".").pop() ?? "";
          const extToCompare = options.caseSensitiveExtensions
            ? ext
            : ext.toLowerCase();
          const allowedExts = options.caseSensitiveExtensions
            ? options.extensions
            : options.extensions.map((e) => e.toLowerCase());
          if (!allowedExts.includes(extToCompare)) continue;
        }
        let size = 0;
        try {
          const stat = await fs.stat(fullPath);
          size = stat.size;
        } catch {
          size = 0;
        }
        children.push({ name: dirent.name, type: "file", size });
      }
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