// Native directory walk for the desktop shell (T-091 / #303). Mirrors
// buildTreeFromPath (localTree.ts) semantics exactly — hidden/vendored
// filters, extension filter + archive exemption, skipEmptyFolders, symlink
// modes with cycle guard, maxDepth cap — but the readdir primitive is the
// shell's windowed list_dir RPC instead of node fs, so it runs in the webview
// of the offline build (no dev server needed).
//
// Symlink info comes from the wire ({ target, broken }); this module completes
// SymlinkInfo (resolvedPath / insideTree) the same way localTree does.
import type { ImportOptions } from "./importOptions";
import { isSkipped, isExtAllowed } from "./fsFilters";
import { isArchiveName } from "./archiveExpand";
import { sortFoldersFirst } from "./treeSort";
import type { SymlinkInfo, TreeEntry } from "./types";

/** One page of the shell's list_dir RPC (see nativeShell.ts / src-tauri). */
export interface NativeListEntry {
  name: string;
  type: "folder" | "file";
  size?: number;
  symlink?: { target: string; broken: boolean };
}
export interface NativeDirPage {
  entries: NativeListEntry[];
  total: number;
}
export type NativeListDir = (path: string, offset: number, limit: number) => Promise<NativeDirPage>;

/** Hard ceiling for `maxDepth: 0` (unlimited) on a real fs walk — same as localTree. */
const MAX_DEPTH_CAP = 8;
const PAGE_SIZE = 500;

/** Read a whole directory via windowed RPC pages. */
async function listAll(listDir: NativeListDir, dirPath: string): Promise<NativeListEntry[]> {
  const out: NativeListEntry[] = [];
  let offset = 0;
  for (;;) {
    const page = await listDir(dirPath, offset, PAGE_SIZE);
    out.push(...page.entries);
    offset += page.entries.length;
    if (offset >= page.total || page.entries.length === 0) break;
  }
  return out;
}

/** localTree's isAllowedFile semantics: no filter when includeFiles off or no
 *  extensions; archives exempt while expansion is on. */
function allowedFile(name: string, options: ImportOptions): boolean {
  if (!options.includeFiles || options.extensions.length === 0) return true;
  if (options.expandArchives && isArchiveName(name)) return true;
  return isExtAllowed(name, options);
}

function joinPath(base: string, name: string): string {
  return base.endsWith("/") ? base + name : `${base}/${name}`;
}

/** Resolve `target` against `base` and normalize `.` / `..` segments. */
export function resolveLinkTarget(base: string, target: string): string {
  const abs = target.startsWith("/")
    ? target
    : joinPath(base.split("/").slice(0, -1).join("/") || "/", target);
  const parts: string[] = [];
  for (const seg of abs.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return `/${parts.join("/")}`;
}

async function walk(
  listDir: NativeListDir,
  dirPath: string,
  depth: number,
  options: ImportOptions,
  rootDir: string,
  visited: Set<string>,
  onProgress?: (phase: string) => void,
): Promise<TreeEntry> {
  const maxDepth = options.maxDepth === 0 ? MAX_DEPTH_CAP : options.maxDepth;
  const shouldRecurse = depth < maxDepth;
  const children: TreeEntry[] = [];

  const raw = shouldRecurse ? await listAll(listDir, dirPath) : [];
  onProgress?.(`Reading ${dirPath.split("/").pop() ?? dirPath}`);

  const dirs: string[] = [];
  const files: { name: string; size: number }[] = [];
  const linkFiles: TreeEntry[] = [];
  const dirLinkCandidates: {
    name: string;
    entryPath: string;
    info: SymlinkInfo;
    targetKey: string;
  }[] = [];

  for (const e of raw) {
    if (isSkipped(e.name, options)) continue;
    const entryPath = joinPath(dirPath, e.name);

    if (e.symlink) {
      if (options.symlinks === "skip") continue;
      const resolved = resolveLinkTarget(entryPath, e.symlink.target);
      const info: SymlinkInfo = {
        target: e.symlink.target,
        resolvedPath: resolved,
        insideTree: resolved === rootDir || resolved.startsWith(`${rootDir}/`),
        broken: e.symlink.broken,
        followed: false,
      };
      // Broken links have no target to type against — emit as files so they
      // stay visible (same as localTree).
      const isDirLink = e.type === "folder" && !e.symlink.broken;
      if (!isDirLink) {
        if (!allowedFile(e.name, options)) continue;
        linkFiles.push({ name: e.name, type: "file", size: e.size ?? 0, symlink: info });
        continue;
      }
      dirLinkCandidates.push({ name: e.name, entryPath, info, targetKey: resolved });
      continue;
    }

    if (e.type === "folder") {
      dirs.push(entryPath);
    } else if (allowedFile(e.name, options)) {
      files.push({ name: e.name, size: e.size ?? 0 });
    }
  }

  // Dir links: follow only when the target is outside the walk root and not
  // already visited (cycle guard by resolved path — the wire has no inode).
  for (const cand of dirLinkCandidates) {
    const canFollow =
      options.symlinks === "follow" && !cand.info.insideTree && !visited.has(cand.targetKey);
    if (canFollow) {
      visited.add(cand.targetKey);
      // Recurse via the RESOLVED target path — works for the real fs (kernel
      // would resolve entryPath too) and for any injected reader.
      const subtree = await walk(
        listDir, cand.targetKey, depth + 1, options, rootDir, visited, onProgress,
      );
      children.push({ ...treeName(subtree, cand.name), symlink: { ...cand.info, followed: true } });
    } else {
      children.push({
        name: cand.name,
        type: "folder",
        children: [],
        symlink: { ...cand.info, followed: false },
      });
    }
  }

  for (const d of dirs) {
    const subtree = await walk(listDir, d, depth + 1, options, rootDir, visited, onProgress);
    // Same empty-folder semantics as localTree.
    if (options.skipEmptyFolders && !subtree.children?.length) continue;
    children.push(subtree);
  }
  // A link is a pointer, never "empty": leaf-mode links survive skipEmptyFolders.
  children.push(...linkFiles);
  for (const f of files) children.push({ name: f.name, type: "file", size: f.size });

  sortFoldersFirst(children);
  return {
    name: dirPath.split("/").pop() || dirPath,
    type: "folder",
    children,
  };
}

function treeName(tree: TreeEntry, name: string): TreeEntry {
  return { ...tree, name };
}

/**
 * Build a TreeEntry from a native directory path. `rootPath` must be absolute.
 * `listDir` is injected so tests drive the walk without the shell.
 */
export async function buildTreeFromNative(
  rootPath: string,
  options: ImportOptions,
  listDir: NativeListDir,
  onProgress?: (phase: string) => void,
): Promise<TreeEntry> {
  const rootDir = rootPath.endsWith("/") ? rootPath.slice(0, -1) : rootPath;
  const visited = new Set<string>([rootDir]);
  const tree = await walk(listDir, rootDir, 0, options, rootDir, visited, onProgress);

  // Expand archives once, at the top of the walk (same seam as localTree):
  // the reader reads bytes through the shell against the real absolute path.
  if (options.expandArchives) {
    const { expandArchives } = await import("./archiveExpand");
    const { nativeFsReadBytes } = await import("./nativeShell");
    await expandArchives(
      tree,
      async (_entry, fullPath) => {
        try {
          const buf = await nativeFsReadBytes(joinPath(rootDir, fullPath), 64 * 1024 * 1024);
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
