/**
 * Recently opened local graph documents (`.fwr`) behind **Open Recent**.
 *
 * localStorage-only — the shell keeps its settings client-side (T-100), and
 * the settings-export snapshot picks up every `fewer*` key for free. Reads are
 * defensive: a corrupt or absent key yields an empty list, never a throw, so
 * SSR and bun tests (no storage) work untouched.
 */

const KEY = "fewer-recent-files";
const MAX = 10;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Pure list merge: most-recent-first, de-duplicated, capped. Kept separate
 * from storage so the ordering rules are testable without a DOM.
 */
export function mergeRecent(path: string, existing: string[], max = MAX): string[] {
  if (!path) return existing.slice(0, max);
  return [path, ...existing.filter((p) => p !== path)].slice(0, max);
}

/** Absolute paths of recently opened documents, most recent first. */
export function recentFiles(): string[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

function writeList(next: string[]): string[] {
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

/** Record a freshly opened path at the front; returns the updated list. */
export function rememberFile(path: string): string[] {
  return writeList(mergeRecent(path, recentFiles()));
}

/** Drop a path that no longer opens (deleted/renamed file); returns the list. */
export function forgetRecent(path: string): string[] {
  return writeList(recentFiles().filter((p) => p !== path));
}