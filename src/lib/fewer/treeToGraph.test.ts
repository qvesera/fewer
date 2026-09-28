import { describe, expect, test } from "bun:test";
import { chunkTreeToGraph, treeToGraph } from "./treeToGraph";
import type { TreeEntry } from "./types";

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
});