"use client";

import type { TreeEntry } from "./types";

/**
 * Attempts to use the File System Access API to let the user pick a
 * directory, then walks it (depth-limited) to produce a TreeEntry.
 *
 * Falls back to <input webkitdirectory> for browsers without the API.
 * Detects Brave browser and provides a specific error message.
 */
export async function pickDirectoryTree(): Promise<TreeEntry | null> {
  const w = window as unknown as {
    showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
  };
  if (typeof w.showDirectoryPicker !== "function") {
    // Fallback to webkitdirectory input
    return pickDirectoryViaInput();
  }

  // Check for Brave browser (which may disable the API by default)
  const isBrave = await detectBrave();
  if (isBrave) {
    // Try anyway — the user may have enabled the flag
    try {
      const handle = await w.showDirectoryPicker!({ mode: "read" });
      return buildTreeFromHandle(handle);
    } catch (err) {
      if (err instanceof DOMException && err.name === "SecurityError") {
        throw new Error(
          "Brave browser blocks the File System Access API by default. Enable it at brave://flags/#file-system-access-api, or use a different browser."
        );
      }
      throw err;
    }
  }

  try {
    const handle = await w.showDirectoryPicker({ mode: "readwrite" });
    setStoredRootHandle(handle);
    return buildTreeFromHandle(handle);
  } catch (err) {
    // User cancelled — return null instead of throwing
    if (err instanceof DOMException && err.name === "AbortError") {
      return null;
    }
    throw err;
  }
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

/**
 * Fallback method using <input type="file" webkitdirectory>.
 * Processes the flat file list and reconstructs the directory hierarchy
 * from webkitRelativePath.
 */
async function pickDirectoryViaInput(): Promise<TreeEntry | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.setAttribute("webkitdirectory", "");
    input.style.position = "fixed";
    input.style.left = "-9999px";

    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      if (files.length === 0) {
        resolve(null);
        return;
      }
      // The first file's webkitRelativePath starts with the root folder name
      const rootName = files[0].webkitRelativePath.split("/")[0] || "root";
      const tree: TreeEntry = { name: rootName, type: "folder", children: [] };

      // Sort by path to ensure parents are processed first
      files.sort((a, b) =>
        a.webkitRelativePath.localeCompare(b.webkitRelativePath)
      );

      for (const file of files) {
        const parts = file.webkitRelativePath.split("/").slice(1); // drop root
        let current = tree;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const isLast = i === parts.length - 1;
          if (isLast) {
            current.children = current.children ?? [];
            current.children.push({
              name: part,
              type: "file",
              size: file.size,
            });
          } else {
            current.children = current.children ?? [];
            let next = current.children.find(
              (c) => c.type === "folder" && c.name === part
            );
            if (!next) {
              next = { name: part, type: "folder", children: [] };
              current.children.push(next);
            }
            current = next;
          }
        }
      }

      // Sort children recursively
      sortTree(tree);
      input.remove();
      resolve(tree);
    };

    input.onerror = () => {
      input.remove();
      reject(new Error("Directory selection failed."));
    };

    document.body.appendChild(input);
    input.click();
  });
}

function sortTree(entry: TreeEntry) {
  if (!entry.children) return;
  entry.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const c of entry.children) sortTree(c);
}

export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as {
      showDirectoryPicker?: unknown;
    }).showDirectoryPicker === "function"
  );
}

/**
 * Detect Brave browser. Brave disables the File System Access API by
 * default behind a flag.
 */
export async function detectBrave(): Promise<boolean> {
  try {
    const nav = navigator as unknown as {
      brave?: { isBrave: () => Promise<boolean> };
    };
    if (typeof nav.brave?.isBrave === "function") {
      return await nav.brave.isBrave();
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Check if we're running in an iframe (File System Access API requires
 * top-level context).
 */
export function isIframeContext(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Create directories on the local file system matching the graph structure.
 * Uses a stored root directory handle to recursively create missing folders.
 *
 * Returns a report of created vs skipped vs failed entries.
 */
export async function updateDirectoryOnDisk(
  rootHandle: FileSystemDirectoryHandle,
  nodes: { id: string; data: { label: string; type: string; path: string } }[],
  edges: { source: string; target: string }[]
): Promise<{ created: string[]; skipped: string[]; failed: string[] }> {
  const created: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  // Build child map: parentId -> childIds
  const childMap = new Map<string, string[]>();
  for (const e of edges) {
    const arr = childMap.get(e.source) ?? [];
    arr.push(e.target);
    childMap.set(e.source, arr);
  }

  // Find root nodes (folders with no parent)
  const hasParent = new Set(edges.map((e) => e.target));
  const roots = nodes.filter((n) => !hasParent.has(n.id) && n.data.type === "folder");

  /**
   * Recursively create directory entries under the given handle.
   */
  async function createRecursively(
    parentId: string | null,
    parentHandle: FileSystemDirectoryHandle,
    basePath: string
  ) {
    const childIds = (parentId ? childMap.get(parentId) : roots.map((r) => r.id)) ?? [];
    for (const childId of childIds) {
      const childNode = nodes.find((n) => n.id === childId);
      if (!childNode || childNode.data.type !== "folder") continue;

      const fullPath = basePath ? `${basePath}/${childNode.data.label}` : childNode.data.label;
      try {
        // Check if the directory already exists
        let childHandle: FileSystemDirectoryHandle;
      try {
          childHandle = await parentHandle.getDirectoryHandle(childNode.data.label);
          skipped.push(fullPath);
        } catch {
          // Doesn't exist — create it
          childHandle = await parentHandle.getDirectoryHandle(childNode.data.label, {
            create: true,
          });
          created.push(fullPath);
        }
        // Recurse into the child
        await createRecursively(childId, childHandle, fullPath);
      } catch (err) {
        console.warn(`Failed to create directory "${fullPath}":`, err);
        failed.push(fullPath);
      }
    }
  }

  await createRecursively(null, rootHandle, "");
  return { created, skipped, failed };
}

/**
 * Store the root directory handle from the last import so we can use it
 * for "Update Directory" operations later.
 */
let storedRootHandle: FileSystemDirectoryHandle | null = null;

export function setStoredRootHandle(handle: FileSystemDirectoryHandle | null) {
  storedRootHandle = handle;
}

export function getStoredRootHandle(): FileSystemDirectoryHandle | null {
  return storedRootHandle;
}
