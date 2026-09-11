"use client";

import type { TreeEntry } from "./types";
import type { ImportOptions } from "./importOptions";
import { shouldKeepEmpty, isExtAllowed, isSkipped, sortFolderFirst } from "./fsFilters";

/**
 * Drain a directory reader in batches (the legacy API returns a few per call).
 */
function readLegacyEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = dir.createReader();
    const all: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(all);
            return;
          }
          all.push(...batch);
          readBatch();
        },
        (err) => reject(err)
      );
    };
    readBatch();
  });
}

function legacyFileSize(file: FileSystemFileEntry): Promise<number> {
  return new Promise((resolve) => {
    file.file((f) => resolve(f.size), () => resolve(0));
  });
}

async function buildEntryFileLeaf(entry: FileSystemFileEntry): Promise<TreeEntry> {
  let size = 0;
  try {
    size = await legacyFileSize(entry);
  } catch {
    size = 0;
  }
  return { name: entry.name, type: "file", size };
}

async function buildEntryDirChild(
  entry: FileSystemDirectoryEntry,
  depth: number,
  options: ImportOptions
): Promise<{ childTree: TreeEntry; childCount: number; hasDiskEntries: boolean } | null> {
  const childTree = await buildTreeFromEntry(entry, depth + 1, options);
  const childCount = childTree.children?.length ?? 0;
  // ponytail: at the depth limit we did NOT recurse — probing disk would
  // violate maxDepth, so treat the folder as "has entries" and keep it.
  const atDepthLimit = options.maxDepth > 0 && depth + 1 >= options.maxDepth;
  const needsProbe = !atDepthLimit && options.skipEmptyFolders && childCount === 0 && !options.includeFiles;
  const hasDiskEntries = needsProbe
    ? (await readLegacyEntries(entry)).length > 0
    : atDepthLimit;
  if (!shouldKeepEmpty(childCount, hasDiskEntries, options)) return null;
  return { childTree, childCount, hasDiskEntries };
}

/**
 * Same semantics as buildTreeFromHandle, but walks a legacy
 * FileSystemDirectoryEntry instead of a FileSystemDirectoryHandle.
 *
 * Used as the drag-and-drop fallback: Chromium under a Flatpak/Snap portal
 * (e.g. Vivaldi, Brave, Opera flatpaks) often fails to materialize a
 * FileSystemDirectoryHandle for OS-dropped folders, while the legacy entry API
 * still exposes the directory. Entries give no usable handle, so fsHandle is
 * omitted — the graph still fully renders; only disk write-back ops need the
 * handle, and those already require a handle backed by a picker.
 */
export async function buildTreeFromEntry(
  entry: FileSystemDirectoryEntry,
  depth: number,
  options: ImportOptions
): Promise<TreeEntry> {
  const children: TreeEntry[] = [];
  const shouldRecurse = options.maxDepth === 0 || depth < options.maxDepth;

  if (shouldRecurse) {
    const raw = await readLegacyEntries(entry);
    for (const child of raw) {
      if (isSkipped(child.name, options)) continue;

      if (child.isDirectory) {
        const result = await buildEntryDirChild(
          child as FileSystemDirectoryEntry,
          depth,
          options
        );
        if (!result) continue;
        children.push(result.childTree);
      } else {
        if (!isExtAllowed(child.name, options)) continue;
        children.push(await buildEntryFileLeaf(child as FileSystemFileEntry));
      }
    }
  }

  sortFolderFirst(children);
  return { name: entry.name, type: "folder", children };
}