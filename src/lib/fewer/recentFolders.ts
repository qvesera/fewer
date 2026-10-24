/**
 * Recently opened folder roots (T-199) — the desktop shell's "Recent Folders"
 * list. Opening a folder is a walk of a real path, so unlike `recentFiles.ts`
 * (opened `.fwr` documents) this list is what makes the shell behave like a
 * file explorer: one click re-opens the directory, no import dialog.
 *
 * localStorage-only, same rules as recentFiles.ts: defensive reads, a corrupt
 * or absent key yields an empty list, never a throw (SSR and bun tests have no
 * storage).
 */

const KEY = "fewer-recent-folders";
const MAX = 8;

export interface RecentFolder {
  /** Absolute OS path of the folder root. */
  path: string;
  /** Display name (the folder's basename). */
  name: string;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Basename of an absolute path, posix or windows separators. */
export function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/**
 * Pure list merge: most-recent-first, de-duplicated by path, capped. Kept
 * separate from storage so the ordering rules are testable without a DOM.
 */
export function mergeRecentFolder(folder: RecentFolder, existing: RecentFolder[], max = MAX): RecentFolder[] {
  if (!folder.path) return existing.slice(0, max);
  return [folder, ...existing.filter((f) => f.path !== folder.path)].slice(0, max);
}

/** Recently opened folder roots, most recent first. */
export function recentFolders(): RecentFolder[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list)
      ? list.filter((f): f is RecentFolder => !!f && typeof f === "object" && typeof (f as RecentFolder).path === "string")
      : [];
  } catch {
    return [];
  }
}

function writeList(next: RecentFolder[]): RecentFolder[] {
  const s = storage();
  if (s) {
    try {
      s.setItem(KEY, JSON.stringify(next));
    } catch {
      // Quota or private mode: the list is a convenience, never load-bearing.
    }
  }
  return next;
}

/** Record a freshly opened folder at the front; returns the updated list. */
export function rememberFolder(path: string): RecentFolder[] {
  if (!path) return recentFolders();
  return writeList(mergeRecentFolder({ path, name: folderName(path) }, recentFolders()));
}

/** Drop a folder that no longer opens (deleted/moved); returns the list. */
export function forgetFolder(path: string): RecentFolder[] {
  return writeList(recentFolders().filter((f) => f.path !== path));
}