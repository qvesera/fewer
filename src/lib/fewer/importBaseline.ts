import type { FewerNode } from "./types";

/**
 * One entry of the import baseline — the tree exactly as it was when it was
 * loaded from disk.
 *
 * The changes script diffs this manifest against the current graph, so it
 * never needs an event log: an action that was undone leaves both sides
 * equal and produces no command at all.
 */
export interface BaselineEntry {
  /** Node id — stable across renames and moves, so the diff can pair entries. */
  id: string;
  /** Path relative to the imported root's parent, root included ("project/src/main.rs"). */
  path: string;
  type: "folder" | "file";
  /** True for the imported root folder itself. */
  isRoot?: boolean;
  /** Symlink target, when this entry is a link. */
  symlink?: string;
  /**
   * True for an archive card: the root of an archive import (the archive file
   * itself), or a zip expanded inside a folder. An archive is ONE file, so
   * the entries inside it are not files on disk.
   */
  isArchive?: boolean;
}

/** Snapshot the given nodes into a baseline manifest (UI-only cards excluded). */
export function captureBaseline(nodes: FewerNode[]): BaselineEntry[] {
  const out: BaselineEntry[] = [];
  for (const n of nodes) {
    const type = n.data?.type;
    if (type !== "file" && type !== "folder") continue;
    const path = n.data.path || n.data.label;
    if (!path) continue;
    const entry: BaselineEntry = { id: n.id, path, type };
    if (n.data.isRoot) entry.isRoot = true;
    if (n.data.isArchive) entry.isArchive = true;
    const link = n.data.symlink?.target;
    if (typeof link === "string" && link) entry.symlink = link;
    out.push(entry);
  }
  return out;
}

/**
 * The imported root's path ("project") — the folder the graph was loaded
 * from, and the folder the replay script expects to run inside.
 */
export function rootLabelOf(nodes: FewerNode[]): string | null {
  const root = nodes.find((n) => n.data?.isRoot && n.data.type === "folder");
  if (root) return root.data.path || root.data.label;
  // No flagged root (a hand-built graph): fall back to the shallowest path.
  let best: string | null = null;
  for (const n of nodes) {
    const p = n.data?.path || n.data?.label;
    if (!p || p.includes("/")) continue;
    if (!best || p.length < best.length) best = p;
  }
  return best;
}

/**
 * Make a path relative to the root folder: "project/src/main.rs" → "src/main.rs".
 * The root itself becomes "" (the folder the script runs inside). Paths that
 * do not live under the root (detached cards) are returned unchanged.
 */
export function stripRoot(path: string, root: string | null): string {
  if (!root) return path;
  if (path === root) return "";
  if (path.startsWith(`${root}/`)) return path.slice(root.length + 1);
  return path;
}
