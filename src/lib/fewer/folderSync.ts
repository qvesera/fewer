/**
 * Folder sync + expand + local-open operations.
 *
 * This module holds the functions that bridge disk state to the graph store —
 * folder expansion, refresh-from-disk, and OS-local file/folder opening. It is
 * the only module in `lib/fewer` allowed to (a) read/write the Zustand graph
 * store and (b) call fetch against the dev-server file APIs. Keeping that
 * coupling in one place breaks the shotgun-surgery pattern: UI components no
 * longer import IO primitives, and IO primitives no longer import the store.
 */

import { fsHandleStore } from "./types";
import type { FewerNode, FewerEdge, TreeEntry } from "./types";
import type { ImportOptions } from "./importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "./importOptions";
import { useGraphStore } from "@/store/graphStore";
import type { GraphState } from "@/store/slices/types";
import { isLocalClient } from "./isLocalClient";
import { nodeAbsolutePath } from "./filePaths";
import { isBrowserRenderable } from "./fileRender";

// ---------------------------------------------------------------------------
// Folder expansion
// ---------------------------------------------------------------------------

/** Expand a folder from disk: create a node linked to its parent + load children. */
export async function expandFolderNode(
  label: string,
  parentId: string,
  position: { x: number; y: number },
  handle: FileSystemDirectoryHandle,
  store: {
    nodes: FewerNode[];
    edges: FewerEdge[];
    nodeWidth: number;
    nodeHeight: number;
    edgeStyle: string;
  },
): Promise<void> {
  const { v4: uuidv4 } = await import("uuid");
  const { treeToGraph } = await import("./treeToGraph");
  const { buildTreeFromHandle } = await import("./fileSystem");
  const { useGraphStore: getStore } = await import("@/store/graphStore");

  const importOpts: ImportOptions = { ...DEFAULT_IMPORT_OPTIONS, maxDepth: 3 };
  const tree = await buildTreeFromHandle(handle, 0, importOpts);
  tree.name = label;
  (tree as TreeEntry & { fsHandle?: FileSystemDirectoryHandle }).fsHandle = handle;

  const { nodes: childNodes, edges: childEdges } = treeToGraph(tree, {
    idPrefix: "drag",
  });

  const parentNode = store.nodes.find((n) => n.id === parentId);
  const parentPath = parentNode?.data.path ?? label;
  const folderNodeId = `n-drag-${uuidv4().slice(0, 8)}`;

  const folderNode: FewerNode = {
    id: folderNodeId,
    type: "folder",
    position,
    data: {
      label,
      path: `${parentPath}/${label}`,
      type: "folder",
      depth: (parentNode?.data.depth ?? 0) + 1,
      isRoot: false,
    },
    style: {
      width: store.nodeWidth,
      height: store.nodeHeight,
    },
  };
  fsHandleStore.set(folderNodeId, handle);

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

  const edgeType =
    store.edgeStyle === "curved"
      ? "default"
      : store.edgeStyle === "angled"
        ? "smoothstep"
        : "straight";
  const parentEdge: FewerEdge = {
    id: `e-${parentId}-${folderNodeId}`,
    source: parentId,
    target: folderNodeId,
    type: edgeType,
  };

  const updatedChildEdges = childEdges.map((e) => {
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
    const typeDiff = (aType === "folder" ? 1 : 0) - (bType === "folder" ? 1 : 0);
    if (typeDiff !== 0) return typeDiff;
    return (bNode?.data.label ?? "").localeCompare(aNode?.data.label ?? "");
  });

  getStore().setState((s) => ({
    nodes: [...s.nodes, ...allNewNodes],
    edges: [...s.edges, ...merged],
  }));

  setTimeout(() => {
    getStore().getState().autoHideLargeFolders();
  }, 0);
}

// ---------------------------------------------------------------------------
// Refresh folder from disk
// ---------------------------------------------------------------------------

/** Re-scan a folder's children from disk and replace its subtree in the graph. */
export async function refreshFolderFromDisk(
  nodeId: string,
): Promise<{ added: number; removed: number; status: "ok" | "no-handle" | "not-found" | "error"; error?: string }> {
  try {
    const store = useGraphStore.getState();
    const folderNode = store.nodes.find((n) => n.id === nodeId);
    if (!folderNode || folderNode.data.type !== "folder") {
      return { added: 0, removed: 0, status: "not-found" };
    }

    const { treeToGraph, rekeyTreeChildren } = await import("./treeToGraph");
    const importOpts: ImportOptions = { ...DEFAULT_IMPORT_OPTIONS, maxDepth: 3 };

    const handle = fsHandleStore.get(nodeId);
    let rawNodes: FewerNode[];
    let rawEdges: FewerEdge[];

    if (handle && handle.kind === "directory") {
      ({ nodes: rawNodes, edges: rawEdges } = await refreshViaHandle(
        handle as FileSystemDirectoryHandle,
        folderNode.data.label,
        importOpts,
        treeToGraph,
      ));
    } else {
      const result = await refreshViaPathWalk(store, folderNode, importOpts, treeToGraph);
      if (result.status !== "ok") {
        return { added: 0, removed: 0, status: result.status, error: result.error };
      }
      rawNodes = result.nodes;
      rawEdges = result.edges;
    }

    const { childNodes, childEdges } = rekeyTreeChildren(
      rawNodes, rawEdges, nodeId, folderNode.data.depth ?? 0,
    );
    const result = store.applyFolderRefresh(nodeId, childNodes, childEdges);
    return { added: result.added, removed: result.removed, status: "ok" };
  } catch (err) {
    return {
      added: 0, removed: 0, status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Channel 1: build tree from a live File System Access handle. */
export async function refreshViaHandle(
  dirHandle: FileSystemDirectoryHandle,
  label: string,
  importOpts: ImportOptions,
  treeToGraph: (tree: TreeEntry, opts: { idPrefix: string }) => { nodes: FewerNode[]; edges: FewerEdge[] },
): Promise<{ nodes: FewerNode[]; edges: FewerEdge[] }> {
  const { buildTreeFromHandle } = await import("./fileSystem");
  const tree = await buildTreeFromHandle(dirHandle, 0, importOpts);
  tree.name = label;
  (tree as TreeEntry & { fsHandle?: FileSystemDirectoryHandle }).fsHandle = dirHandle;
  return treeToGraph(tree, { idPrefix: "refresh" });
}

/** Result of a path-walk refresh attempt. */
type RefreshPathResult =
  | { status: "ok"; nodes: FewerNode[]; edges: FewerEdge[] }
  | { status: "no-handle" | "error"; error?: string };

/** Channel 2: resolve absolute path and re-walk via the local dev server. */
export async function refreshViaPathWalk(
  store: GraphState,
  folderNode: FewerNode,
  importOpts: ImportOptions,
  treeToGraph: (tree: TreeEntry, opts: { idPrefix: string }) => { nodes: FewerNode[]; edges: FewerEdge[] },
): Promise<RefreshPathResult> {
  const rootNode = store.nodes.find((n: FewerNode) => n.data.isRoot && n.data.type === "folder");
  const absPath = nodeAbsolutePath(folderNode.data.path, rootNode?.data.path, store.localRootPath);
  if (!absPath) {
    return { status: "no-handle" };
  }

  const res = await fetch("/api/list-directory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: absPath, options: importOpts }),
  });
  const json = (await res.json().catch(() => null)) as { tree?: TreeEntry | null; error?: string } | null;
  if (!res.ok || !json?.tree) {
    return { status: "error", error: json?.error ?? "Server returned " + res.status };
  }
  json.tree.name = folderNode.data.label;
  const { nodes, edges } = treeToGraph(json.tree, { idPrefix: "refresh" });
  return { status: "ok", nodes, edges };
}

// ---------------------------------------------------------------------------
// Local file / folder opening
// ---------------------------------------------------------------------------

/** Resolve the graph's root folder to its absolute dev-machine path. */
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

/** Open a local file node in its OS default app via /api/open-file. */
export async function openNodeFile(
  node: { id: string; data: { type: string; path?: string } },
  dataSource: string,
): Promise<boolean> {
  if (isLocalClient() && node.data.path) {
    try {
      const res = await fetch("/api/open-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: node.data.path }),
      });
      if (res.ok) return true;
    } catch {
      // server not reachable
    }
  }
  if (node.data.type === "file") {
    const handle = fsHandleStore.get(node.id);
    if (handle && handle.kind === "file") {
      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      if (isBrowserRenderable(file.name, file.type)) {
        const { openFile } = await import("./fsPrimitives");
        await openFile(fileHandle);
        return true;
      }
      return false;
    }
  }
  return false;
}

/** Open a folder in the OS file explorer via /api/open-folder. */
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

/** Download a remote file straight to disk (blob fetch, anchor fallback). */
export async function downloadRemoteFile(url: string, filename?: string): Promise<boolean> {
  const name = filename || decodeURIComponent(url.split("/").filter(Boolean).pop() || "download");
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
