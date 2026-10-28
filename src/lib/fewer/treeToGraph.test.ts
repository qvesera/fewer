import { describe, expect, test } from "bun:test";
import { chunkTreeToGraph, treeToGraph } from "./treeToGraph";
import { fsHandleStore, type TreeEntry } from "./types";

const linkTree: TreeEntry = {
  name: "root",
  type: "folder",
  children: [
    {
      name: "v012",
      type: "folder",
      children: [{ name: "shot.exr", type: "file", size: 42 }],
    },
    {
      name: "latest",
      type: "folder",
      children: [],
      symlink: {
        target: "v012",
        resolvedPath: "/show/v012",
        insideTree: true,
        followed: false,
      },
    },
    {
      name: "alias.txt",
      type: "file",
      size: 5,
      symlink: { target: "a.txt", resolvedPath: "/show/a.txt", insideTree: true, broken: false, followed: false },
    },
    { name: "dangling", type: "file", size: 0, symlink: { target: "nowhere", resolvedPath: "/show/nowhere", broken: true } },
  ],
};

describe("treeToGraph symlink propagation", () => {
  test("copies symlink metadata onto node data in both graph builders", () => {
    const { nodes } = treeToGraph(linkTree);
    const byPath = (p: string) => nodes.find((n) => n.data.path === p)!;

    const latest = byPath("root/latest");
    expect(latest.data.type).toBe("folder");
    expect(latest.data.symlink).toMatchObject({ target: "v012", insideTree: true, followed: false });

    const alias = byPath("root/alias.txt");
    expect(alias.data.type).toBe("file");
    expect(alias.data.symlink).toMatchObject({ target: "a.txt", broken: false });

    const dangling = byPath("root/dangling");
    expect(dangling.data.symlink).toMatchObject({ broken: true });

    // Non-link nodes carry no symlink field.
    expect(byPath("root/v012").data.symlink).toBeUndefined();
    expect(byPath("root/v012/shot.exr").data.symlink).toBeUndefined();
  });

  test("chunkTreeToGraph (the chunked twin) copies symlink metadata too", async () => {
    const { nodes } = await chunkTreeToGraph(linkTree);
    const latest = nodes.find((n) => n.data.path === "root/latest")!;
    expect(latest.data.symlink).toMatchObject({ target: "v012", followed: false });
    const dangling = nodes.find((n) => n.data.path === "root/dangling")!;
    expect(dangling.data.symlink).toMatchObject({ broken: true });
    expect(nodes.find((n) => n.data.path === "root/v012")!.data.symlink).toBeUndefined();
  });

  test("chunkTreeToGraph yields between batches and finishes at processed === total", async () => {
    // Big enough to cross the 500-entry batch boundary more than once.
    const children = Array.from({ length: 1200 }, (_, i) => ({
      name: `f${i}.txt`,
      type: "file" as const,
      size: 1,
    }));
    const bigTree: TreeEntry = { name: "root", type: "folder", children };

    const seen: { processed: number; total: number }[] = [];
    // Interleave a macrotask check: the walk must give the main thread back,
    // otherwise the import dialog's progress bar can never repaint.
    let ticked = false;
    setTimeout(() => (ticked = true), 0);

    const chunked = await chunkTreeToGraph(bigTree, {}, (p) => seen.push(p));

    expect(ticked).toBe(true); // the walk actually awaited
    expect(seen.length).toBeGreaterThan(1); // more than the start/end pair
    expect(seen[0]).toMatchObject({ processed: 0, total: 1201 });
    expect(seen[seen.length - 1]).toMatchObject({ processed: 1201, total: 1201 });
    // Monotonic — a bar must never run backwards.
    const processed = seen.map((p) => p.processed);
    expect([...processed].sort((a, b) => a - b)).toEqual(processed);

    // Parity with the sync builder: same nodes, same edges, same order. Ids are
    // random per build, so compare the topology through the node paths.
    const sync = treeToGraph(bigTree);
    const pathOf = (nodes: { id: string; data: { path: string } }[]) =>
      new Map(nodes.map((n) => [n.id, n.data.path]));
    expect(chunked.nodes.map((n) => n.data.path)).toEqual(
      sync.nodes.map((n) => n.data.path),
    );
    const chunkedPaths = pathOf(chunked.nodes);
    const syncPaths = pathOf(sync.nodes);
    const shape = (edges: { source: string; target: string }[], paths: Map<string, string>) =>
      edges.map((e) => `${paths.get(e.source)}→${paths.get(e.target)}`);
    expect(shape(chunked.edges, chunkedPaths)).toEqual(
      shape(sync.edges, syncPaths),
    );
  });

  test("chunkTreeToGraph hides files and records fsHandle ids like the sync builder", async () => {
    const handle = { name: "a.txt" } as unknown as FileSystemFileHandle;
    const tree: TreeEntry = {
      name: "root",
      type: "folder",
      children: [{ name: "a.txt", type: "file", size: 1, fsHandle: handle }],
    };

    const sync = treeToGraph(tree, { includeFiles: false });
    const chunked = await chunkTreeToGraph(tree, { includeFiles: false });

    expect(chunked.hiddenFileIds).toEqual([chunked.nodes[1].id]);
    expect(sync.hiddenFileIds).toEqual([sync.nodes[1].id]);
    expect(fsHandleStore.get(chunked.nodes[1].id)).toBe(handle);
  });
});