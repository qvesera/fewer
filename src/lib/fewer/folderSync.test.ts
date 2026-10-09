import { describe, test, expect, mock, afterEach } from "bun:test";
import { refreshViaPathWalk, refreshViaNativeWalk } from "./folderSync";
import { DEFAULT_IMPORT_OPTIONS } from "./importOptions";
import type { FewerNode, FewerEdge, TreeEntry } from "./types";

/**
 * refreshViaPathWalk is the only folderSync function that doesn't need the
 * live FS Access API — it resolves an absolute path, fetches from the dev
 * server, and hands the result to treeToGraph. We mock fetch + treeToGraph to
 * exercise all three return channels (ok / no-handle / error).
 */

const mockTreeToGraph = mock((tree: TreeEntry, _opts: { idPrefix: string }) => ({
  nodes: [{ id: "n1", type: "file" as const, position: { x: 0, y: 0 },
    data: { label: tree.name, path: "/" + tree.name, type: "file" as const } }] as FewerNode[],
  edges: [] as FewerEdge[],
}));

afterEach(() => {
  mockTreeToGraph.mockClear();
});

describe("refreshViaPathWalk", () => {
  test("returns no-handle when absolute path cannot be resolved", async () => {
    // No root node with isRoot → nodeAbsolutePath returns null.
    const store = {
      nodes: [{ id: "a", type: "folder", position: { x: 0, y: 0 },
        data: { label: "a", path: "root/a", type: "folder" } }] as FewerNode[],
      localRootPath: "/abs/root",
    };
    const folderNode: FewerNode = {
      id: "a", type: "folder", position: { x: 0, y: 0 },
      data: { label: "a", path: "a", type: "folder" },
    };
    const result = await refreshViaPathWalk(store, folderNode, { maxDepth: 3 } as any, mockTreeToGraph);
    expect(result.status).toBe("no-handle");
  });

  test("returns ok + parsed tree on a successful server response", async () => {
    const fetchMock = mock(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ tree: { name: "sub", children: [] } }),
    }));
    (globalThis as any).fetch = fetchMock;

    const store = {
      nodes: [
        { id: "root", type: "folder", position: { x: 0, y: 0 },
          data: { label: "root", path: "root", type: "folder", isRoot: true } },
        { id: "sub", type: "folder", position: { x: 0, y: 0 },
          data: { label: "sub", path: "root/sub", type: "folder" } },
      ] as FewerNode[],
      localRootPath: "/abs/root",
    };
    const folderNode: FewerNode = {
      id: "sub", type: "folder", position: { x: 0, y: 0 },
      data: { label: "sub", path: "root/sub", type: "folder" },
    };
    const result = await refreshViaPathWalk(store, folderNode, { maxDepth: 3 } as any, mockTreeToGraph);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.nodes).toHaveLength(1);
      expect(result.edges).toHaveLength(0);
    }
    expect(mockTreeToGraph).toHaveBeenCalledTimes(1);
  });

  test("returns error when server responds non-ok", async () => {
    const fetchMock = mock(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    }));
    (globalThis as any).fetch = fetchMock;

    const store = {
      nodes: [
        { id: "root", type: "folder", position: { x: 0, y: 0 },
          data: { label: "root", path: "root", type: "folder", isRoot: true } },
        { id: "sub", type: "folder", position: { x: 0, y: 0 },
          data: { label: "sub", path: "root/sub", type: "folder" } },
      ] as FewerNode[],
      localRootPath: "/abs/root",
    };
    const folderNode: FewerNode = {
      id: "sub", type: "folder", position: { x: 0, y: 0 },
      data: { label: "sub", path: "root/sub", type: "folder" },
    };
    const result = await refreshViaPathWalk(store, folderNode, { maxDepth: 3 } as any, mockTreeToGraph);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toBe("boom");
    }
  });
});

describe("refreshViaNativeWalk", () => {
  const opts = { ...DEFAULT_IMPORT_OPTIONS, maxDepth: 3 };

  function shellStore(localRootPath: string | null) {
    return {
      nodes: [
        { id: "root", type: "folder", position: { x: 0, y: 0 },
          data: { label: "root", path: "root", type: "folder", isRoot: true } },
        { id: "sub", type: "folder", position: { x: 0, y: 0 },
          data: { label: "sub", path: "root/sub", type: "folder" } },
      ] as FewerNode[],
      localRootPath,
    };
  }
  const folderNode: FewerNode = {
    id: "sub", type: "folder", position: { x: 0, y: 0 },
    data: { label: "sub", path: "root/sub", type: "folder" },
  };

  test("returns no-handle without touching the RPC when the root path is unknown", async () => {
    const listDir = mock(async () => ({ entries: [], total: 0 }));
    const result = await refreshViaNativeWalk(
      shellStore(null), folderNode, opts, mockTreeToGraph, listDir,
    );
    expect(result.status).toBe("no-handle");
    expect(listDir).not.toHaveBeenCalled();
  });

  test("walks the resolved absolute path through the injected list_dir", async () => {
    // nodeAbsolutePath("root/sub", "root", "/abs/root") → "/abs/root/sub".
    const listDir = mock(async (_p: string) => ({
      entries: [{ name: "note.txt", type: "file" as const, size: 3 }],
      total: 1,
    }));
    const result = await refreshViaNativeWalk(
      shellStore("/abs/root"), folderNode, opts, mockTreeToGraph, listDir,
    );

    expect(result.status).toBe("ok");
    // The RPC must be queried at the folder's ABSOLUTE path, never the
    // relative node path — that is what made refresh fail standalone.
    expect(listDir).toHaveBeenCalledTimes(1);
    expect(listDir.mock.calls[0][0]).toBe("/abs/root/sub");
    if (result.status === "ok") {
      expect(result.nodes).toHaveLength(1);
      expect(result.edges).toHaveLength(0);
    }
    expect(mockTreeToGraph).toHaveBeenCalledTimes(1);
    // The tree is renamed to the graph node's label, like the other channels.
    expect(mockTreeToGraph.mock.calls[0][0].name).toBe("sub");
    expect(mockTreeToGraph.mock.calls[0][1]).toEqual({ idPrefix: "refresh" });
  });

  test("propagates a reader failure so refreshFolderFromDisk reports an error", async () => {
    const listDir = mock(async () => {
      throw new Error("ENOENT: no such directory");
    });
    await expect(
      refreshViaNativeWalk(shellStore("/abs/root"), folderNode, opts, mockTreeToGraph, listDir),
    ).rejects.toThrow("ENOENT: no such directory");
    expect(mockTreeToGraph).not.toHaveBeenCalled();
  });
});
