"use client";

import { fsHandleStore } from "./types";
import { useGraphStore } from "@/store/graphStore";
import { isLocalClient } from "./isLocalClient";

/**
 * Real file system operations using the File System Access API.
 * These functions actually modify files on disk — not just the graph.
 *
 * All functions require a FileSystemDirectoryHandle or FileSystemFileHandle
 * obtained via showDirectoryPicker() or showOpenFilePicker().
 */

/**
 * Copy a file from one directory to another on disk.
 */
export async function copyFile(
  sourceHandle: FileSystemFileHandle,
  targetDir: FileSystemDirectoryHandle,
  newName?: string,
): Promise<FileSystemFileHandle> {
  const file = await sourceHandle.getFile();
  const name = newName || sourceHandle.name;
  const newHandle = await targetDir.getFileHandle(name, { create: true });
  const writable = await newHandle.createWritable();
  await writable.write(file);
  await writable.close();
  return newHandle;
}

/**
 * Move a file to a different directory (copy + delete source).
 * If target is the same directory, uses handle.move() instead.
 */
export async function moveFile(
  sourceHandle: FileSystemFileHandle,
  sourceDir: FileSystemDirectoryHandle,
  targetDir: FileSystemDirectoryHandle,
  newName?: string,
): Promise<FileSystemFileHandle> {
  const name = newName || sourceHandle.name;

  // If same directory, just rename
  if (sourceDir === targetDir && !newName) {
    return sourceHandle; // nothing to do
  }

  if (sourceDir === targetDir && newName) {
    // Use move() for rename within same dir (if supported)
    const moveable = sourceHandle as unknown as {
      move?: (name: string) => Promise<void>;
    };
    if (typeof moveable.move === "function") {
      try {
        await moveable.move!(newName);
        return sourceHandle;
      } catch {
        // Fallback to copy + delete
      }
    }
  }

  // Copy to target, then delete source
  const newHandle = await copyFile(sourceHandle, targetDir, name);
  await sourceDir.removeEntry(sourceHandle.name);
  return newHandle;
}

/**
 * Delete a file from disk permanently.
 * Note: Browser FS API does not support "trash" — this is permanent.
 */
export async function deleteFile(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
): Promise<void> {
  await dirHandle.removeEntry(fileName);
}

/**
 * Delete a directory from disk (recursive).
 */
export async function deleteDirectory(
  parentDir: FileSystemDirectoryHandle,
  dirName: string,
): Promise<void> {
  await parentDir.removeEntry(dirName, { recursive: true });
}

/**
 * Create a new empty file in the given directory.
 */
export async function createFile(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  content: string | Blob = "",
): Promise<FileSystemFileHandle> {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  return fileHandle;
}

/**
 * Create a new directory.
 */
export async function createDirectory(
  parentHandle: FileSystemDirectoryHandle,
  dirName: string,
): Promise<FileSystemDirectoryHandle> {
  return parentHandle.getDirectoryHandle(dirName, { create: true });
}

/**
 * Rename a file or folder on disk.
 * Uses handle.move() if available, otherwise copy + delete.
 */
export async function renameEntry(
  handle: FileSystemHandle,
  newName: string,
): Promise<void> {
  if (
    typeof (handle as unknown as { move?: (n: string) => Promise<void> })
      .move === "function"
  ) {
    try {
      await (handle as unknown as { move: (n: string) => Promise<void> }).move(
        newName,
      );
      return;
    } catch {
      // Fallback below
    }
  }
  // No fallback possible without the parent handle — caller should handle this
  throw new Error("Rename not supported on this browser");
}

/**
 * Open a file in a new browser tab using an object URL.
 * Works for images, PDFs, text, video, audio, etc.
 */
export async function openFile(handle: FileSystemFileHandle): Promise<void> {
  const file = await handle.getFile();
  const url = URL.createObjectURL(file);
  window.open(url, "_blank");
  // Revoke after 60 seconds to allow viewing
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Types browsers can render inline — opening a live handle for these in a new
 *  tab is fine. Everything else should go through the OS default app, or we'd
 *  silently trigger a download for the unsupported type. */
const RENDERABLE_PREFIXES = ["image/", "text/", "video/", "audio/", "font/"];
const RENDERABLE_TYPES = new Set([
  "application/pdf",
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-javascript",
  "application/svg+xml",
]);
const RENDERABLE_EXT =
  /\.(?:png|jpe?g|gif|webp|avif|svg|bmp|ico|pdf|txt|md|json|xml|html?|css|js|mjs|mp3|wav|ogg|oga|m4a|flac|mp4|webm|ogv|mov|ttf|otf|woff2?)$/i;

/** These look renderable (MIME starts with text/) but browsers simply download
 *  them on navigation. Send them to the OS default app instead. */
const DOWNLOAD_TYPES = new Set([
  "text/csv",
  "application/csv",
  "text/tab-separated-values",
  "application/vnd.ms-excel",
]);

function isBrowserRenderable(name: string, mime?: string): boolean {
  const type = (mime || "").trim().toLowerCase().split(";")[0];
  if (DOWNLOAD_TYPES.has(type) || /\.(?:csv|tsv|tab)$/i.test(name)) return false;
  if (RENDERABLE_PREFIXES.some((p) => type.startsWith(p))) return true;
  if (RENDERABLE_TYPES.has(type)) return true;
  return RENDERABLE_EXT.test(name);
}

/**
 * Absolute path of a node on the dev machine, given the graph's saved/known
 * absolute root folder (`localRootPath`) and the root node's relative
 * `data.path` (which is just the root folder's name). Returns null when the
 * node doesn't live under the root (detached/renamed) — callers then fall back
 * to the server's path-search.
 */
export function nodeAbsolutePath(
  nodePath: string | undefined,
  rootPath: string | undefined,
  localRootPath: string | null | undefined,
): string | null {
  if (!nodePath || !rootPath || !localRootPath) return null;
  if (nodePath === rootPath) return localRootPath;
  if (nodePath.startsWith(`${rootPath}/`)) {
    return `${localRootPath}/${nodePath.slice(rootPath.length + 1)}`;
  }
  return null;
}

/**
 * Resolve the current graph's root folder to its absolute path on this dev
 * machine (via /api/resolve-path) and stash it in the store. Called after a
 * directory import and again at save time, so the path only has to be
 * searched once — afterwards opens use it directly and saved graphs carry it.
 * Returns the resolved path, or null when there's nothing to resolve here.
 */
export async function resolveRootLocalPath(): Promise<string | null> {
  const st = useGraphStore.getState();
  const root = st.nodes.find((n) => n.data.isRoot && n.data.type === "folder");
  const rel = root?.data.path;
  if (!rel) return st.localRootPath ?? null;
  try {
    const res = await fetch("/api/resolve-path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: rel }),
    });
    const json = await res.json().catch(() => null);
    const resolved = json?.resolved;
    if (typeof resolved === "string" && resolved) {
      useGraphStore.getState().setLocalRootPath(resolved);
      return resolved;
    }
  } catch {
    // Not running on a machine with the dev server, or path unresolvable.
  }
  return st.localRootPath ?? null;
}


/**
 * Open a local file node in its dedicated OS app (the default app for that
 * file type). We POST the node's path to /api/open-file, which the dev server
 * resolves to a real path and hands to `open` / `start` / `xdg-open`.
 * This runs for any source that carries a path, so files of every type —
 * including ones the browser can't render — open in their OS default app
 * instead of silently downloading.
 * Falls back to opening in the browser via a live file handle (object URL)
 * only for types a browser can actually render, and only when no
 * server-resolvable path is available.
 * Returns true if a file was opened somehow.
 */
export async function openNodeFile(
  node: { id: string; data: { type: string; path?: string } },
  dataSource: string,
): Promise<boolean> {
  // 1) Open in the OS default app via the server API — the only route that
  //    hands the file to `xdg-open` / `open` / `start`. Only works when the
  //    client is on the same machine as the server (localhost).
  if (node.data.path && isLocalClient()) {
    const st = useGraphStore.getState();
    const root = st.nodes.find((n) => n.data.isRoot);
    const sendPath =
      nodeAbsolutePath(node.data.path, root?.data.path, st.localRootPath) ??
      node.data.path;
    try {
      const res = await fetch("/api/open-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: sendPath }),
      });
      if (res.ok) return true;
    } catch {
      // server not reachable
    }
  }
  // 2) Browser fallback: check for a live File System Access handle. This
  //    only works in Chromium browsers and only within the same page session
  //    (handles are lost on refresh).
  if (node.data.type === "file") {
    const handle = fsHandleStore.get(node.id);
    if (handle && handle.kind === "file") {
      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      if (isBrowserRenderable(file.name, file.type)) {
        await openFile(fileHandle);
        return true;
      }
      return false;
    }
  }
  return false;
}
/**
 * Open a folder in the OS file explorer via /api/open-folder. Returns true
 * when the server acknowledged the open request, false on failure.
 * Uses the resolved root location (saved with the graph as localRootPath) to
 * avoid searching the filesystem again on every open.
 */
export async function openFolderInExplorer(path: string): Promise<boolean> {
  const st = useGraphStore.getState();
  const root = st.nodes.find((n) => n.data.isRoot);
  const sendPath = nodeAbsolutePath(path, root?.data.path, st.localRootPath) ?? path;
  try {
    const res = await fetch("/api/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: sendPath }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to open folder");
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Open folder error:", msg);
    return false;
  }
}

/**
 * Download a remote file (e.g. a crawled public-index item) straight to disk.
 * Tries to read it as a blob first (so we control the saved filename); if the
 * server doesn't send CORS headers and the body can't be read, falls back to a
 * plain anchor click so the browser's native behavior applies — Apache/nginx
 * auto-indexes send `Content-Disposition: attachment`, so that still downloads.
 * Returns true once a download was started.
 */
export async function downloadRemoteFile(url: string, filename?: string): Promise<boolean> {
  const name =
    filename ||
    decodeURIComponent(url.split("/").filter(Boolean).pop() || "download");
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) throw new Error("non-ok");
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
    return true;
  } catch {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  }
}



/**
 * Get file metadata (size, type, last modified).
 */
export async function getFileMetadata(handle: FileSystemFileHandle): Promise<{
  name: string;
  size: number;
  type: string;
  lastModified: number;
}> {
  const file = await handle.getFile();
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  };
}

/**
 * Check if a file or directory exists in the given directory.
 */
export async function entryExists(
  dirHandle: FileSystemDirectoryHandle,
  name: string,
): Promise<"file" | "directory" | null> {
  try {
    await dirHandle.getFileHandle(name);
    return "file";
  } catch {
    try {
      await dirHandle.getDirectoryHandle(name);
      return "directory";
    } catch {
      return null;
    }
  }
}

/**
 * Get a unique name by appending " copy" if the name already exists.
 */
export async function getUniqueName(
  dirHandle: FileSystemDirectoryHandle,
  baseName: string,
): Promise<string> {
  const exists = await entryExists(dirHandle, baseName);
  if (!exists) return baseName;

  const dot = baseName.lastIndexOf(".");
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
  const ext = dot > 0 ? baseName.slice(dot) : "";

  let counter = 1;
  while (true) {
    const candidate = `${stem} copy${counter > 1 ? ` ${counter}` : ""}${ext}`;
    const exists2 = await entryExists(dirHandle, candidate);
    if (!exists2) return candidate;
    counter++;
  }
}

/**
 * Expand a folder from disk: create a new node linked to its parent,
 * then read the folder's contents from disk and create child nodes.
 *
 * This is used when dragging a folder from a parent's child list onto the
 * canvas — it creates the node AND loads its contents so the user can see
 * what's inside.
 */
export async function expandFolderNode(
  label: string,
  parentId: string,
  position: { x: number; y: number },
  handle: FileSystemDirectoryHandle,
  store: {
    nodes: import("@/lib/fewer/types").FewerNode[];
    edges: import("@/lib/fewer/types").FewerEdge[];
    nodeWidth: number;
    nodeHeight: number;
    edgeStyle: import("@/lib/fewer/types").EdgeStyle;
  },
): Promise<void> {
  const { v4: uuidv4 } = await import("uuid");
  const { treeToGraph } = await import("./treeToGraph");
  const { buildTreeFromHandle } = await import("./fileSystem");
  const { DEFAULT_IMPORT_OPTIONS } = await import("./importOptions");
  const { useGraphStore } = await import("@/store/graphStore");

  // Read the folder's contents from disk (up to depth 3)
  const importOpts = { ...DEFAULT_IMPORT_OPTIONS, maxDepth: 3 };
  const tree = await buildTreeFromHandle(handle, 0, importOpts);
  tree.name = label;
  tree.fsHandle = handle;

  // Convert to graph nodes + edges
  const { nodes: childNodes, edges: childEdges } = treeToGraph(tree, {
    idPrefix: "drag",
  });

  // Create the parent folder node
  const parentNode = store.nodes.find((n) => n.id === parentId);
  const parentPath = parentNode?.data.path ?? label;
  const folderNodeId = `n-drag-${uuidv4().slice(0, 8)}`;

  const folderNode = {
    id: folderNodeId,
    type: "folder" as const,
    position,
    data: {
      label,
      path: `${parentPath}/${label}`,
      type: "folder" as const,
      depth: (parentNode?.data.depth ?? 0) + 1,
      isRoot: false,
    },
    style: {
      width: store.nodeWidth,
      height: store.nodeHeight,
    },
  };
  // Store fsHandle separately to avoid live browser API objects on node data
  fsHandleStore.set(folderNodeId, handle);

  // Offset child nodes relative to the folder node
  const offsetChildren = childNodes.map((n) => ({
    ...n,
    position: {
      x: n.position.x + position.x + 100,
      y: n.position.y + position.y + 100,
    },
    data: {
      ...n.data,
      depth: (n.data.depth ?? 0) + (parentNode?.data.depth ?? 0) + 2,
    },
    style: {
      width: store.nodeWidth,
      height: n.data.type === "folder" ? store.nodeHeight : undefined,
    },
  }));

  // Create edge from parent to new folder
  const edgeType = store.edgeStyle === "curved" ? "default" : store.edgeStyle === "angled" ? "smoothstep" : "straight";
  const parentEdge: { id: string; source: string; target: string; type: string } = {
    id: `e-${parentId}-${folderNodeId}`,
    source: parentId,
    target: folderNodeId,
    type: edgeType,
  };

  // Update edges to reference the new folder as source (instead of the
  // temporary root from treeToGraph)
  const updatedChildEdges = childEdges.map((e) => {
    // The first node from treeToGraph is the root folder — replace it
    // with our folderNodeId
    const rootChild = childNodes[0];
    if (rootChild && e.source === rootChild.id) {
      return { ...e, source: folderNodeId };
    }
    return e;
  });

  const allNewNodes = [folderNode, ...offsetChildren];
  const nodeMap = new Map(allNewNodes.map((n) => [n.id, n]));
  const merged = [...updatedChildEdges, parentEdge].sort((a, b) => {
    const aNode = nodeMap.get(a.target);
    const bNode = nodeMap.get(b.target);
    const aType = aNode?.data.type ?? "file";
    const bType = bNode?.data.type ?? "file";
    // Fully descending: files first, then folders, labels z-a
    const typeDiff = (aType === "folder" ? 1 : 0) - (bType === "folder" ? 1 : 0);
    if (typeDiff !== 0) return typeDiff;
    return (bNode?.data.label ?? "").localeCompare(aNode?.data.label ?? "");
  });

  // Add everything to the store
  useGraphStore.setState((s) => ({
    nodes: [...s.nodes, ...allNewNodes],
    edges: [...s.edges, ...merged],
  }));

  // Re-apply auto-hide: if the dragged folder has >10 children, hide them
  setTimeout(() => {
    useGraphStore.getState().autoHideLargeFolders();
  }, 0);

}
