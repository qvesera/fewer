import { describe, test, expect, mock, afterEach } from "bun:test";
import { refreshViaPathWalk } from "./folderSync";
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
