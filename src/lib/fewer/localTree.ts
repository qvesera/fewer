import fs from "fs/promises";
import path from "path";
import type { SymlinkInfo, TreeEntry } from "./types";
import type { ImportOptions } from "./importOptions";
import { VENDORED_DIRS } from "./importOptions";
import { isArchiveName } from "./archiveExpand";
import { sortFoldersFirst } from "./treeSort";

/**
 * Server-side directory walker for drag-and-drop fallbacks.
 *
 * Browsers that expose the dropped folder as a local path (portalized Chromium
 * builds on Flatpak/Snap deliver `text/uri-list`, never a directory item) let
 * the local dev server read the folder directly. Semantics mirror
 * buildTreeFromHandle so a drag import behaves exactly like a picker import.
 *
 * This is also the ONLY walk that can detect symlinks (the File System Access
 * and legacy Entry APIs resolve them transparently), so the `symlinks` import
 * option is honored here exclusively.
 */
/** Extension filter for files, mirroring buildTreeFromHandle: files always pass
 *  the filter when includeFiles is off (they get marked hidden downstream) or
 *  when no extensions are configured. An archive is exempt while expansion is
 *  on, so the filter applies to the files inside it instead of dropping it. */
function isAllowedFile(fileName: string, options: ImportOptions): boolean {
  if (!options.includeFiles || options.extensions.length === 0) return true;
  if (options.expandArchives && isArchiveName(fileName)) return true;
  const ext = fileName.split(".").pop() ?? "";
  const extToCompare = options.caseSensitiveExtensions ? ext : ext.toLowerCase();
  const allowedExts = options.caseSensitiveExtensions
    ? options.extensions
    : options.extensions.map((e) => e.toLowerCase());
  return allowedExts.includes(extToCompare);
}

/**
 * Build SymlinkInfo for a link at `linkPath` (the caller already confirmed it
 * is a link via dirent). `rootDir` calibrates `insideTree`. Broken links stat
 * as nothing — the caller decides how to type them.
 */
async function symlinkInfoAt(
  linkPath: string,
  rootDir: string,
): Promise<{ info: SymlinkInfo; targetStat: Awaited<ReturnType<typeof fs.stat>> | null }> {
  let target = "";
  try {
    target = await fs.readlink(linkPath);
  } catch {
    target = "";
  }
  const resolvedPath = path.resolve(path.dirname(linkPath), target || linkPath);
  let targetStat: Awaited<ReturnType<typeof fs.stat>> | null = null;
  try {
    targetStat = await fs.stat(linkPath); // follows the link
  } catch {
    targetStat = null; // dangling link
  }
  const insideTree = resolvedPath === rootDir || resolvedPath.startsWith(rootDir + path.sep);
  return {
    info: {
      target: target || path.basename(linkPath),
      resolvedPath,
      insideTree,
      broken: targetStat === null,
    },
    targetStat,
  };
}

export async function buildTreeFromPath(
  dirPath: string,
  depth: number,
  options: ImportOptions,
  rootDir: string = path.resolve(dirPath),
  visited: Set<string> = new Set(),
): Promise<TreeEntry> {
  const children: TreeEntry[] = [];

  // maxDepth 0 ("unlimited") is fine for the browser's sandboxed walk, but a
  // local fs walk of the ENTIRE disk tree would crawl forever — clamp it.
  const maxDepth = options.maxDepth === 0 ? MAX_DEPTH_CAP : options.maxDepth;
  const shouldRecurse = maxDepth === 0 || depth < maxDepth;

  // Cycle-guard bookkeeping: mark this directory's inode at entry (covers the
  // root, which is never "queued" by a parent).
  try {
    const st = await fs.stat(dirPath);
    visited.add(`${st.dev}:${st.ino}`);
  } catch {
    /* unreadable dir — readdir below will surface the failure */
  }

  if (shouldRecurse) {
    const dirents = await fs.readdir(dirPath, { withFileTypes: true });

    const dirs: string[] = [];
    const files: { name: string; path: string }[] = [];
    // Symlinks, handled per options.symlinks. File/broken links resolve to an
    // immediate entry; directory links are collected as candidates and the
    // follow/leaf decision is made AFTER the entry loop, once every real dir in
    // this readdir pass is pre-marked — that makes the outcome deterministic
    // (independent of readdir order) and sibling links never duplicate a dir
    // that is already being walked.
    const links: { subtree: Promise<TreeEntry> }[] = [];
    const dirLinkCandidates: { name: string; entryPath: string; info: SymlinkInfo; targetKey: string | null }[] = [];

    for (const dirent of dirents) {
      // Skip hidden files/folders if not included
      if (!options.includeHidden && dirent.name.startsWith(".")) continue;

      // Skip vendored directories if not included
      if (!options.includeVendored && VENDORED_DIRS.has(dirent.name)) continue;

      const entryPath = path.join(dirPath, dirent.name);

      if (dirent.isSymbolicLink()) {
        // Pre-change behavior: links are dropped entirely.
        if (options.symlinks === "skip") continue;
        const { info, targetStat } = await symlinkInfoAt(entryPath, rootDir);
        const isDirLink = !info.broken && (targetStat?.isDirectory() ?? false);
        // Broken links have no target to type against — emit as files so they
        // stay visible in the graph (they are entries, not folders).
        if (!isDirLink) {
          if (!isAllowedFile(dirent.name, options)) continue;
          const size = Number(targetStat?.isFile() ? targetStat.size : 0);
          links.push({
            subtree: Promise.resolve({
              name: dirent.name,
              type: "file",
              size,
              symlink: { ...info, followed: false },
            }),
          });
          continue;
        }
        dirLinkCandidates.push({
          name: dirent.name,
          entryPath,
          info,
          targetKey: targetStat ? `${targetStat.dev}:${targetStat.ino}` : null,
        });
        continue;
      }

      if (dirent.isDirectory()) {
        // Pre-mark the inode at queue time so a dir link processed after the
        // loop sees the dir is already being walked (no duplicate expansion).
        try {
          const st = await fs.stat(entryPath);
          visited.add(`${st.dev}:${st.ino}`);
        } catch {
          /* unreadable — the recursion's readdir will fail on it */
        }
        dirs.push(entryPath);
      } else if (dirent.isFile() && isAllowedFile(dirent.name, options)) {
        files.push({ name: dirent.name, path: entryPath });
      }
    }

    // "leaf" → link node without content. "follow" → recurse into the target,
    // but ONLY when the target lies outside the walk root: an internal target
    // is (or will be) walked at its real location, so following it would
    // duplicate the subtree — the link renders as a leaf and navigation does
    // the rest. Targets already visited (a second link to the same external
    // dir, or a self-referencing loop like bin → res/…/bin) degrade to leaves
    // too, so the walk terminates and each inode is expanded at most once.
    for (const cand of dirLinkCandidates) {
      const canFollow =
        options.symlinks === "follow" &&
        !cand.info.insideTree &&
        cand.targetKey !== null &&
        !visited.has(cand.targetKey);
      if (canFollow) {
        // Pre-mark the target BEFORE queuing so a second link to the same
        // dir degrades to a leaf (the recursion's own entry-mark is a no-op).
        visited.add(cand.targetKey!);
        links.push({
          subtree: buildTreeFromPath(cand.entryPath, depth + 1, options, rootDir, visited)
            .then((tree) => ({ ...tree, symlink: { ...cand.info, followed: true } })),
        });
      } else {
        links.push({
          subtree: Promise.resolve({
            name: cand.name,
            type: "folder",
            children: [],
            symlink: { ...cand.info, followed: false },
          }),
        });
      }
    }

    // Filesystem calls are data-independent — parallelize the recursion, the
    // link subtrees and the stats instead of awaiting each entry serially.
    const [dirTrees, linkTrees, fileSizes] = await Promise.all([
      Promise.all(dirs.map((d) => buildTreeFromPath(d, depth + 1, options, rootDir, visited))),
      Promise.all(links.map((l) => l.subtree)),
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

    for (let i = 0; i < dirTrees.length; i++) {
      // Same empty-folder semantics as buildTreeFromHandle.
      if (options.skipEmptyFolders && !dirTrees[i]!.children?.length) continue;
      children.push(dirTrees[i]!);
    }
    for (const linkTree of linkTrees) {
      // A link is a pointer, never "empty": skipEmptyFolders must not drop
      // leaf-mode links (their content is simply not imported by design).
      children.push(linkTree!);
    }
    for (let i = 0; i < files.length; i++) {
      children.push({ name: files[i]!.name, type: "file", size: fileSizes[i]! });
    }
  }

  // Folders first (dir links included — a link to a dir IS a folder), then
  // alphabetical — same as buildTreeFromHandle.
  sortFoldersFirst(children);

  const tree: TreeEntry = { name: path.basename(dirPath) || dirPath, type: "folder", children };

  // Expand archives once, at the top of the walk (depth 0). Doing it deeper
  // would re-expand the same subtree on every recursive call. The reader reads
  // from disk against the real absolute path, which only this side knows.
  if (options.expandArchives && depth === 0) {
    const { expandArchives } = await import("./archiveExpand");
    const base = rootDir ?? dirPath;
    await expandArchives(
      tree,
      async (_entry, fullPath) => {
        try {
          const buf = await fs.readFile(path.join(base, fullPath));
          return new Blob([buf]);
        } catch {
          return null;
        }
      },
      options,
    );
  }

  return tree;
}

/** Hard ceiling for `maxDepth: 0` (unlimited) on a real fs walk. */
const MAX_DEPTH_CAP = 8;