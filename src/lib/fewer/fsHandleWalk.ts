"use client";

import type { TreeEntry } from "./types";
import type { ImportOptions } from "./importOptions";
import { shouldKeepEmpty, isExtAllowed, isSkipped, sortFolderFirst } from "./fsFilters";

// Cast shim — .values() exists at runtime but isn't in older TS lib defs
type HandleIterable = {
  values: () => AsyncIterableIterator<
    { name: string; kind: "file" | "directory" } & (
      | FileSystemFileHandle
      | FileSystemDirectoryHandle
    )
  >;
};

async function listHandleEntries(handle: FileSystemDirectoryHandle) {
  const iterable = handle as unknown as HandleIterable;
  const out: { name: string; kind: "file" | "directory" }[] = [];
  for await (const entry of iterable.values()) out.push(entry);
  return out;
}

async function buildFileLeaf(entry: {
  name: string;
  kind: "file" | "directory";
}): Promise<TreeEntry> {
  let size = 0;
  try {
    size = (await (entry as FileSystemFileHandle).getFile()).size;
  } catch {
    size = 0;
  }
  return {
    name: entry.name,
    type: "file",
    size,
    fsHandle: entry as FileSystemFileHandle,
  };
}

function keepDirChild(
  childTree: TreeEntry,
  childCount: number,
  options: ImportOptions,
  hasDiskEntries: boolean
): boolean {
  return shouldKeepEmpty(childCount, hasDiskEntries, options);
}

/**
 * Walk a FileSystemDirectoryHandle (depth-limited) to produce a TreeEntry.
 * Exported for callers: pickDirectoryTree, expandFolderNode, refreshFolderFromDisk,
 * treeFromDropped, ImportOriginStep.
 */
export async function buildTreeFromHandle(
  handle: FileSystemDirectoryHandle,
  depth: number,
  options: ImportOptions
): Promise<TreeEntry> {
  const children: TreeEntry[] = [];
  const shouldRecurse = options.maxDepth === 0 || depth < options.maxDepth;

  if (shouldRecurse) {
    const entries = await listHandleEntries(handle);
    for (const entry of entries) {
      if (isSkipped(entry.name, options)) continue;

      if (entry.kind === "directory") {
        const childTree = await buildTreeFromHandle(
          entry as FileSystemDirectoryHandle,
          depth + 1,
          options
        );
        childTree.fsHandle = entry as FileSystemDirectoryHandle;
        const childCount = childTree.children?.length ?? 0;
        // ponytail: at the depth limit we did NOT recurse — probing disk would
        // violate maxDepth, so treat the folder as "has entries" and keep it.
        const atDepthLimit = options.maxDepth > 0 && depth + 1 >= options.maxDepth;
        const needsProbe =
          !atDepthLimit && options.skipEmptyFolders && childCount === 0 && !options.includeFiles;
        const hasDiskEntries = needsProbe
          ? await directoryHasEntries(entry as FileSystemDirectoryHandle)
          : atDepthLimit;
        if (!keepDirChild(childTree, childCount, options, hasDiskEntries)) continue;
        children.push(childTree);
      } else {
        if (!isExtAllowed(entry.name, options)) continue;
        children.push(await buildFileLeaf(entry));
      }
    }
  }

  sortFolderFirst(children);
  return { name: handle.name, type: "folder", children, fsHandle: handle };
}

/**
 * Check if a directory has ANY entries (files or subdirectories) on disk.
 * Used when includeFiles is false to distinguish between truly empty folders
 * and folders that contain only files (which aren't imported as nodes).
 */
async function directoryHasEntries(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const iterable = handle as unknown as {
    values: () => AsyncIterableIterator<{ name: string; kind: string }>;
  };
  for await (const _ of iterable.values()) return true;
  return false;
}