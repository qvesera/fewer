import type { TreeEntry } from "@/lib/fewer/types";

export interface TreeDiff {
  added: string[];
  removed: string[];
}

/**
 * Flatten a tree into a set of absolute paths (folder + file).
 * Paths are "/"-joined from the root name, e.g. "root/src/index.ts".
 */
function flattenPaths(entry: TreeEntry, prefix: string, out: Set<string>): void {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  out.add(path);
  if (entry.children) {
    for (const child of entry.children) flattenPaths(child, path, out);
  }
}

/**
 * Diff two crawled trees by path. Returns paths present in `next` but not
 * `prev` (added) and paths present in `prev` but not `next` (removed).
 * Sorted alphabetically for stable, readable digests.
 */
export function diffTrees(prev: TreeEntry | null, next: TreeEntry): TreeDiff {
  const prevPaths = new Set<string>();
  const nextPaths = new Set<string>();
  if (prev) flattenPaths(prev, "", prevPaths);
  flattenPaths(next, "", nextPaths);

  const added: string[] = [];
  const removed: string[] = [];
  for (const p of nextPaths) if (!prevPaths.has(p)) added.push(p);
  for (const p of prevPaths) if (!nextPaths.has(p)) removed.push(p);

  added.sort((a, b) => a.localeCompare(b));
  removed.sort((a, b) => a.localeCompare(b));
  return { added, removed };
}