/**
 * Pure path helpers for fewer — extracted from fileOps.ts so they can be
 * tested without the File System Access API or DOM.
 */

/**
 * Absolute path of a node on the dev machine, given the graph's saved/known
 * absolute root folder (`localRootPath`) and the root node's relative
 * `data.path` (which is just the root folder's name). Returns null when the
 * node doesn't live under the root (detached/renamed) — callers then fall back
 * to the server's path-search.
 */
export function nodeAbsolutePath(
  nodePath: string | undefined,
  rootPath: string | undefined,
  localRootPath: string | null | undefined,
): string | null {
  if (!nodePath || !rootPath || !localRootPath) return null;
  if (nodePath === rootPath) return localRootPath;
  if (nodePath.startsWith(`${rootPath}/`)) {
    return `${localRootPath}/${nodePath.slice(rootPath.length + 1)}`;
  }
  return null;
}