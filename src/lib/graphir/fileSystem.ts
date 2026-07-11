"use client";

import type { TreeEntry } from "./types";
import {
  type ImportOptions,
  DEFAULT_IMPORT_OPTIONS,
  VENDORED_DIRS,
} from "./importOptions";

/**
 * Attempts to use the File System Access API to let the user pick a
 * directory, then walks it (depth-limited) to produce a TreeEntry.
 *
 * Falls back to <input webkitdirectory> for browsers without the API.
 * Detects Brave browser and provides a specific error message.
 *
 * @param options Controls depth, filtering, and what to include.
 */
export async function pickDirectoryTree(
  options: ImportOptions = DEFAULT_IMPORT_OPTIONS
): Promise<TreeEntry | null> {
  const w = window as unknown as {
    showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
  };
  if (typeof w.showDirectoryPicker !== "function") {
    // Fallback to webkitdirectory input
    return pickDirectoryViaInput(options);
  }

  // Check for Brave browser (which may disable the API by default)
  const isBrave = await detectBrave();
  if (isBrave) {
    // Try anyway — the user may have enabled the flag
    try {
      const handle = await w.showDirectoryPicker!({ mode: "read" });
      setStoredRootHandle(handle);
      return buildTreeFromHandle(handle, 0, options);
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
    return buildTreeFromHandle(handle, 0, options);
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
  depth: number,
  options: ImportOptions
): Promise<TreeEntry> {
  const children: TreeEntry[] = [];

  // maxDepth of 0 means unlimited; otherwise stop when we hit the limit
  const shouldRecurse = options.maxDepth === 0 || depth < options.maxDepth;

  if (shouldRecurse) {
    // Cast to access .values() which exists at runtime but isn't in older TS lib defs
    const iterable = handle as unknown as {
      values: () => AsyncIterableIterator<
        { name: string; kind: "file" | "directory" } & (
          | FileSystemFileHandle
          | FileSystemDirectoryHandle
        )
      >;
    };
    for await (const entry of iterable.values()) {
      // Skip hidden files/folders if not included
      if (!options.includeHidden && entry.name.startsWith(".")) continue;

      // Skip vendored directories if not included
      if (!options.includeVendored && VENDORED_DIRS.has(entry.name)) continue;

      if (entry.kind === "directory") {
        const childTree = await buildTreeFromHandle(
          entry as FileSystemDirectoryHandle,
          depth + 1,
          options
        );
        // Skip empty folders if option is set
        if (options.skipEmptyFolders && childTree.children && childTree.children.length === 0) {
          continue;
        }
        childTree.fsHandle = entry as FileSystemDirectoryHandle;
        children.push(childTree);
      } else {
        // Filter by extension if extensions list is non-empty
        if (options.extensions.length > 0) {
          const ext = entry.name.split(".").pop() ?? "";
          const extToCompare = options.caseSensitiveExtensions ? ext : ext.toLowerCase();
          const allowedExts = options.caseSensitiveExtensions
            ? options.extensions
            : options.extensions.map((e) => e.toLowerCase());
          if (!allowedExts.includes(extToCompare)) continue;
        }

        let size: number | undefined;
        try {
          const file = await (entry as FileSystemFileHandle).getFile();
          size = file.size;
        } catch {
          size = 0;
        }
        children.push({
          name: entry.name,
          type: "file",
          size,
          fsHandle: entry as FileSystemFileHandle,
        });
      }
    }
  }

  // Sort: folders first, then alphabetical
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { name: handle.name, type: "folder", children, fsHandle: handle };
}

/**
 * Fallback method using <input type="file" webkitdirectory>.
 * Processes the flat file list and reconstructs the directory hierarchy
 * from webkitRelativePath. Applies the same ImportOptions filtering.
 */
async function pickDirectoryViaInput(
  options: ImportOptions = DEFAULT_IMPORT_OPTIONS
): Promise<TreeEntry | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.setAttribute("webkitdirectory", "");
    input.style.position = "fixed";
    input.style.left = "-9999px";

    input.onchange = async () => {
      const allFiles = Array.from(input.files ?? []);
      if (allFiles.length === 0) {
        resolve(null);
        return;
      }

      // Filter files by options
      const filteredFiles = allFiles.filter((file) => {
        const parts = file.webkitRelativePath.split("/");
        // Check hidden
        if (!options.includeHidden) {
          if (parts.some((p) => p.startsWith("."))) return false;
        }
        // Check vendored
        if (!options.includeVendored) {
          if (parts.some((p) => VENDORED_DIRS.has(p))) return false;
        }
        // Check depth (parts.length - 1 = depth from root)
        if (options.maxDepth > 0 && parts.length - 1 > options.maxDepth) return false;
        // Check extension
        if (options.extensions.length > 0) {
          const ext = file.name.split(".").pop() ?? "";
          const extToCompare = options.caseSensitiveExtensions ? ext : ext.toLowerCase();
          const allowedExts = options.caseSensitiveExtensions
            ? options.extensions
            : options.extensions.map((e) => e.toLowerCase());
          if (!allowedExts.includes(extToCompare)) return false;
        }
        return true;
      });

      // The first file's webkitRelativePath starts with the root folder name
      const rootName = allFiles[0].webkitRelativePath.split("/")[0] || "root";
      const tree: TreeEntry = { name: rootName, type: "folder", children: [] };

      // Sort by path to ensure parents are processed first
      filteredFiles.sort((a, b) =>
        a.webkitRelativePath.localeCompare(b.webkitRelativePath)
      );

      for (const file of filteredFiles) {
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

      // Remove empty folders if option is set
      if (options.skipEmptyFolders) {
        removeEmptyFolders(tree);
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

/**
 * Recursively remove folders that have no children (empty folders).
 * The root is never removed.
 */
function removeEmptyFolders(entry: TreeEntry): boolean {
  if (!entry.children || entry.children.length === 0) {
    return entry.type === "file"; // keep files, mark folders for removal
  }
  entry.children = entry.children.filter((child) => {
    if (child.type === "folder") {
      const keep = removeEmptyFolders(child);
      return keep;
    }
    return true; // always keep files
  });
  return entry.children.length > 0;
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
