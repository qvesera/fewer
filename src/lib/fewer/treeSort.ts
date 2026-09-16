import type { TreeEntry } from "./types";

/**
 * Canonical tree ordering: folders first, then alphabetical by name.
 *
 * Every tree builder in the app ends with this ordering — the fs walkers, the
 * webkitdirectory fallback, the crawler, the auto-index builder, the Internet
 * Archive import, and the parsers.
 *
 * Deliberately NOT in `fsFilters.ts` next to the other walker helpers: that
 * module is `"use client"`, and several callers here are imported by route
 * handlers (api/crawl, api/list-directory). A client directive on this module
 * would turn these functions into client references and break those server
 * call sites at runtime. Keep this file directive-free and dependency-free
 * (type-only import) so both graphs can use it.
 */
export function sortFoldersFirst(children: { type: string; name: string }[]): void {
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** Sort every level of a tree in place, deepest included. */
export function sortTreeFoldersFirst(entry: TreeEntry): void {
  if (!entry.children) return;
  sortFoldersFirst(entry.children);
  for (const c of entry.children) sortTreeFoldersFirst(c);
}
