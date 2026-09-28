"use client";

import type { TreeEntry } from "./types";
import type { ImportOptions } from "./importOptions";
import { shouldKeepEmpty, isExtAllowed, isSkipped } from "./fsFilters";
import { isArchiveName } from "./archiveExpand";
import { sortFoldersFirst } from "./treeSort";

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

async function buildEntryFileLeaf(entry: FileSystemFileEntry): Promise<TreeEntry> {
  // Grab the File once and keep it: the legacy API hands us a disk-backed Blob
  // for free, and the archive reader needs those bytes later.
  let size = 0;
  let blob: File | undefined;
  try {
    blob = await new Promise<File>((resolve, reject) => {
      entry.file(resolve, () => reject(new Error("unreadable")));
    });
    size = blob.size;
  } catch {
    size = 0;
  }
  return { name: entry.name, type: "file", size, archiveBlob: blob };
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
        // An archive passes the extension filter when expansion is on, so the
        // filter applies to the files inside it instead of dropping it.
        if (
          !isExtAllowed(child.name, options) &&
          !(options.expandArchives && isArchiveName(child.name))
        ) {
          continue;
        }
        children.push(await buildEntryFileLeaf(child as FileSystemFileEntry));
      }
    }
  }

  sortFoldersFirst(children);
  const tree: TreeEntry = { name: entry.name, type: "folder", children };

  // The legacy entry API already gave us every file as a Blob, so the reader
  // just hands back what buildEntryFileLeaf kept.
  if (options.expandArchives) {
    const { expandArchives } = await import("./archiveExpand");
    await expandArchives(
      tree,
      async (leaf) => leaf.archiveBlob ?? null,
      options,
    );
  }

  return tree;
}