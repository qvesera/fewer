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
    const handle = await w.showDirectoryPicker({ mode: "read" });
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
