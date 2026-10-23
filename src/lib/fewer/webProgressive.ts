"use client";

import type { ImportOptions } from "./importOptions";
import type { ScanDirEntry } from "./progressiveScan";
import { LOCAL_FS_FEATURES } from "./features";
import { pickDirectoryHandle } from "./fileSystem";
import { showInputPicker } from "./fsInputFallback";

/**
 * Web progressive source (T-208): a `listAll(path)` over either a File System
 * Access handle tree or the flat FileList the webkitdirectory fallback gives
 * us. `path` follows the same convention the walker uses — the ROOT NAME is
 * the base, children are "root/child", so batches and node paths match the
 * shell's exactly.
 */

export interface WebScanSource {
  rootName: string;
  listAll(path: string): Promise<ScanDirEntry[]>;
}

/** FSA handle tree: registers child handles as each directory is listed. */
export function handleScanSource(handle: FileSystemDirectoryHandle): WebScanSource {
  const handles = new Map<string, FileSystemDirectoryHandle>([[handle.name, handle]]);
  const listAll = async (path: string): Promise<ScanDirEntry[]> => {
    const dir = handles.get(path);
    if (!dir) throw new Error(`unknown folder: ${path}`);
    const out: ScanDirEntry[] = [];
    const iterable = dir as unknown as {
      values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
    };
    for await (const entry of iterable.values()) {
      if (entry.kind === "directory") {
        handles.set(`${path}/${entry.name}`, entry as FileSystemDirectoryHandle);
        out.push({ name: entry.name, type: "folder" });
      } else {
        let size = 0;
        try {
          size = (await (entry as FileSystemFileHandle).getFile()).size;
        } catch {
          size = 0;
        }
        out.push({ name: entry.name, type: "file", size });
      }
    }
    return out;
  };
  return { rootName: handle.name, listAll };
}

export interface GroupedFiles {
  rootName: string;
  /** dir path → its direct entries (folders derived from file paths). */
  dirs: Map<string, ScanDirEntry[]>;
}

/**
 * Pure grouping of a webkitdirectory FileList into per-directory listings.
 * Empty folders are invisible to the input picker (a FileList has no
 * directory entries) — same limitation the legacy full walk already has.
 */
export function groupFilesForScan(
  files: Array<{ relativePath: string; size: number }>,
): GroupedFiles | null {
  const first = files[0]?.relativePath.split("/")[0];
  if (!first) return null;
  const dirs = new Map<string, ScanDirEntry[]>();
  const push = (path: string, entry: ScanDirEntry) => {
    const list = dirs.get(path);
    if (!list) dirs.set(path, [entry]);
    else if (!list.some((e) => e.name === entry.name)) list.push(entry);
  };
  for (const f of files) {
    const parts = f.relativePath.split("/");
    const name = parts.pop();
    if (!name) continue;
    const parent = parts.join("/");
    if (!parent) continue; // a bare file at the picker root has no folder
    push(parent, { name, type: "file", size: f.size });
    // Register every intermediate directory with its parent.
    for (let i = 1; i < parts.length; i++) {
      push(parts.slice(0, i).join("/"), { name: parts[i]!, type: "folder" });
    }
  }
  return { rootName: first, dirs };
}

export function groupedScanSource(grouped: GroupedFiles): WebScanSource {
  return {
    rootName: grouped.rootName,
    listAll: async (path: string) => {
      const entries = grouped.dirs.get(path);
      if (!entries) throw new Error(`unknown folder: ${path}`);
      return entries;
    },
  };
}

/**
 * Pick a folder on the web and return its progressive source, or null on
 * cancel. FSA browsers stream handle-by-handle; the webkitdirectory fallback
 * groups the flat FileList up front (still shown progressively by depth).
 */
export async function pickWebScanSource(): Promise<WebScanSource | null> {
  if (LOCAL_FS_FEATURES.fsaDirectoryPicker) {
    const handle = await pickDirectoryHandle();
    if (handle) return handleScanSource(handle);
    // pickDirectoryHandle returns null only on cancel; no FSA at all is
    // handled by the gate above, so a null here means the user cancelled.
    return null;
  }
  const list = await showInputPicker();
  const all = list ? Array.from(list) : [];
  if (!all.length) return null;
  const grouped = groupFilesForScan(
    all.map((f) => ({ relativePath: f.webkitRelativePath, size: f.size })),
  );
  return grouped ? groupedScanSource(grouped) : null;
}