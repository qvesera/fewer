"use client";

// ── Filter utilities ─────────────────────────────────────────────
// Shared by handle walker, entry walker, and webkitdirectory fallback.

import type { ImportOptions } from "./importOptions";
import { VENDORED_DIRS } from "./importOptions";

export function isSkipped(name: string, options: ImportOptions): boolean {
  if (!options.includeHidden && name.startsWith(".")) return true;
  if (!options.includeVendored && VENDORED_DIRS.has(name)) return true;
  return false;
}

export function isExtAllowed(filename: string, options: ImportOptions): boolean {
  if (options.extensions.length === 0) return true;
  const ext = filename.split(".").pop() ?? "";
  const extToCompare = options.caseSensitiveExtensions ? ext : ext.toLowerCase();
  const allowedExts = options.caseSensitiveExtensions
    ? options.extensions
    : options.extensions.map((e) => e.toLowerCase());
  return allowedExts.includes(extToCompare);
}

// Shared empty-folder decision across handle and entry walkers.
// hasDiskEntries is the real on-disk check; childCount is the import result.
// ponytail: if includeFiles is false we MUST probe disk — no shortcut.
export function shouldKeepEmpty(
  childCount: number,
  hasDiskEntries: boolean,
  options: ImportOptions
): boolean {
  if (!options.skipEmptyFolders) return true;
  if (childCount > 0) return true;
  if (options.includeFiles) return false; // no children + files tracked = truly empty
  return hasDiskEntries; // keep folders that only contain un-imported files
}

// ponytail: default sort works for both handle and entry walker children
export function sortFolderFirst(children: { type: string; name: string }[]) {
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}