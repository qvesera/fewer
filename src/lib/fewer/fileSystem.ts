"use client";

import type { TreeEntry } from "./types";
import type { ImportOptions } from "./importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "./importOptions";
import { LOCAL_FS_FEATURES } from "./features";
import { buildTreeFromHandle } from "./fsHandleWalk";
import { buildTreeFromEntry } from "./fsEntryWalk";
import { pickDirectoryViaInput } from "./fsInputFallback";

// Re-export walkers + fallback so existing callers keep working.
export { buildTreeFromHandle } from "./fsHandleWalk";
export { buildTreeFromEntry } from "./fsEntryWalk";
export { pickDirectoryViaInput } from "./fsInputFallback";

/**
 * Attempts to use the File System Access API to let the user pick a
 * directory, then walks it (depth-limited) to produce a TreeEntry.
 *
 * Falls back to <input webkitdirectory> for browsers without the API.
 * Detects Brave browser and provides a specific error message.
 *
 * @param options Controls depth, filtering, and what to include.
 */
// Type for the picker options — add startIn and id
interface PickerOpts {
  mode?: string;
  startIn?: FileSystemDirectoryHandle | "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
  id?: string;
}

export async function pickDirectoryTree(
  options: ImportOptions = DEFAULT_IMPORT_OPTIONS,
  startIn?: PickerOpts["startIn"],
): Promise<TreeEntry | null> {
  // When local-filesystem features are off (e.g. Tauri shell), skip the
  // File System Access API entirely and use the legacy <input webkitdirectory>
  // fallback. The legacy picker works in every webview engine.
  if (!LOCAL_FS_FEATURES.fsaDirectoryPicker) {
    return pickDirectoryViaInput(options);
  }

  const w = window as unknown as {
    showDirectoryPicker?: (opts?: PickerOpts) => Promise<FileSystemDirectoryHandle>;
  };
  if (typeof w.showDirectoryPicker !== "function") {
    // Fallback to webkitdirectory input
    return pickDirectoryViaInput(options);
  }

  const pickerOpts: PickerOpts = {
    mode: "readwrite",
    id: "fewer-import",
  };
  if (startIn) pickerOpts.startIn = startIn;

  // Check for Brave browser (which may disable the API by default)
  const isBrave = await detectBrave();
  if (isBrave) {
    // Try anyway — the user may have enabled the flag
    try {
      const handle = await w.showDirectoryPicker!({ ...pickerOpts, mode: "read" });
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
    const handle = await w.showDirectoryPicker(pickerOpts);
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

// ── Brave / iframe detection ───────────────────────────────────────

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
