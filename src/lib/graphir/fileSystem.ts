"use client";

import type { TreeEntry } from "./types";

/**
 * Attempts to use the File System Access API to let the user pick a
 * directory, then walks it (depth-limited) to produce a TreeEntry.
 *
 * Falls back gracefully if the API isn't available.
 */
export async function pickDirectoryTree(): Promise<TreeEntry | null> {
  const w = window as unknown as {
    showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
  };
  if (typeof w.showDirectoryPicker !== "function") {
    throw new Error("File System Access API is not available in this browser.");
  }

  const handle = await w.showDirectoryPicker({ mode: "read" });
  return buildTreeFromHandle(handle);
}

async function buildTreeFromHandle(
  handle: FileSystemDirectoryHandle,
  depth = 0
): Promise<TreeEntry> {
  // Cap recursion to keep the graph manageable
  const MAX_DEPTH = 6;
  const children: TreeEntry[] = [];

  if (depth < MAX_DEPTH) {
    for await (const entry of handle.values()) {
      if (entry.name.startsWith(".git") || entry.name === "node_modules") continue;
      if (entry.kind === "directory") {
        children.push(
          await buildTreeFromHandle(entry as FileSystemDirectoryHandle, depth + 1)
        );
      } else {
        let size: number | undefined;
        try {
          const file = await (entry as FileSystemFileHandle).getFile();
          size = file.size;
        } catch {
          size = 0;
        }
        children.push({ name: entry.name, type: "file", size });
      }
    }
  }

  // Sort: folders first, then alphabetical
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { name: handle.name, type: "folder", children };
}

export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as {
      showDirectoryPicker?: unknown;
    }).showDirectoryPicker === "function"
  );
}
