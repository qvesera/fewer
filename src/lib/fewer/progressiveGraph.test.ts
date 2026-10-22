import { describe, expect, test } from "bun:test";
import { buildBatchGraph, buildGraphFromBatches, buildRootNode, connectOrphansToRoot } from "./progressiveGraph";
import type { ScanBatch } from "./progressiveScan";
import type { FewerNode } from "./types";

// Batches → nodes, keyed by the store's relative paths (T-205/206).

const node = (id: string, path: string): FewerNode =>
  ({
    id,
    position: { x: 0, y: 0 },
    data: { label: path.split("/").pop(), path, type: "file" },
  }) as unknown as FewerNode;

const BATCHES: ScanBatch[] = [
  {
    parentPath: "",
    parentDepth: 0,
    entries: [
      { name: "src", type: "folder" },
      { name: "README.md", type: "file", size: 120 },
    ],
  },
  {
    parentPath: "src",
    parentDepth: 1,
    entries: [{ name: "main.ts", type: "file", size: 42 }],
  },
];

describe("buildGraphFromBatches", () => {
  test("wires root → folders → children with the store's path convention", () => {
    const graph = buildGraphFromBatches("app", BATCHES, { includeFiles: true });
    const root = graph.nodes[0]!;
    expect(root.data.isRoot).toBe(true);
    expect(root.data.path).toBe("app");
    const paths = graph.nodes.map((n) => n.data.path).sort();
    expect(paths).toEqual(["app", "app/README.md", "app/src", "app/src/main.ts"]);
    const main = graph.nodes.find((n) => n.data.path === "app/src/main.ts")!;
    expect(main.data.extension).toBe("ts");
    expect(main.data.category).toBe("code");
    expect(main.data.depth).toBe(2);
    const edge = graph.edges.find((e) => e.target === main.id)!;
    expect(edge.source).toBe(graph.nodes.find((n) => n.data.path === "app/src")!.id);
    // T-212: the ROOT batch must wire the root's own children too — a graph
    // with N nodes has N-1 edges and no parentless non-root node.
    expect(graph.edges).toHaveLength(graph.nodes.length - 1);
    const hasParent = new Set(graph.edges.map((e) => e.target));
    expect(graph.nodes.filter((n) => n.id !== root.id && !hasParent.has(n.id))).toHaveLength(0);
  });

  test("includeFiles false drops file nodes entirely", () => {
    const graph = buildGraphFromBatches("app", BATCHES, { includeFiles: false });
    expect(graph.nodes.every((n) => n.data.type === "folder")).toBe(true);
  });

  test("an expanded archive is a folder container carrying isArchive (T-220)", () => {
    // The scan promotes an archive that WILL be expanded to `type: "folder"`
    // + `isArchive` (exactly what expandArchives does on a tree entry), so the
    // card renders as an archive container and its members can hang off it.
    const batches: ScanBatch[] = [
      {
        parentPath: "",
        parentDepth: 0,
        entries: [{ name: "Logos.zip", type: "folder", isArchive: true }],
      },
      {
        parentPath: "Logos.zip",
        parentDepth: 1,
        entries: [{ name: "logo.svg", type: "file", size: 5 }],
      },
    ];
    const graph = buildGraphFromBatches("app", batches, { includeFiles: true });
    const zip = graph.nodes.find((n) => n.data.path === "app/Logos.zip")!;
    expect(zip.data.type).toBe("folder");
    expect(zip.data.isArchive).toBe(true);
    expect(zip.data.extension).toBe(""); // containers carry no file extension
    const member = graph.nodes.find((n) => n.data.path === "app/Logos.zip/logo.svg")!;
    expect(graph.edges.find((e) => e.target === member.id)!.source).toBe(zip.id);

    // "Folders only" must not eat the archives: promotion happens before the
    // file filter, so a zip survives as a container.
    const foldersOnly = buildGraphFromBatches("app", batches, { includeFiles: false });
    expect(foldersOnly.nodes.map((n) => n.data.path)).toContain("app/Logos.zip");
    expect(foldersOnly.nodes.some((n) => n.data.isArchive !== true && !n.data.isRoot)).toBe(false);
  });
});

describe("buildBatchGraph / buildRootNode", () => {
  test("unknown parent attaches to the provided root instead of orphaning", () => {
    const root = buildRootNode("app");
    const built = buildBatchGraph("app", BATCHES[1]!, () => undefined, {
      includeFiles: true,
      rootId: root.id,
    });
    expect(built.nodes).toHaveLength(1);
    expect(built.edges).toHaveLength(1);
    expect(built.edges[0]!.source).toBe(root.id);
  });

  test("no root available → the node stays parentless (heal attaches it later)", () => {
    const built = buildBatchGraph("app", BATCHES[1]!, () => undefined, { includeFiles: true });
    expect(built.nodes).toHaveLength(1);
    expect(built.edges).toHaveLength(0);
  });

  test("root node is depth 0", () => {
    expect(buildRootNode("app").data.depth).toBe(0);
  });
});

describe("connectOrphansToRoot (T-212)", () => {
  const root = buildRootNode("app");

  test("attaches parentless non-root nodes, keeps the rest untouched", () => {
    const nodes = [root, node("a", "app/src")];
    const extra = connectOrphansToRoot(nodes, [], root.id);
    expect(extra).toHaveLength(1);
    expect(extra[0]).toMatchObject({ source: root.id, target: "a" });
    // Already-wired and repeated runs are no-ops.
    expect(connectOrphansToRoot(nodes, extra, root.id)).toHaveLength(0);
  });

  test("group pills and the root itself are never re-parented", () => {
    const pill = {
      id: "pill-1",
      type: "groupPill",
      position: { x: 0, y: 0 },
      data: { label: "g", path: "", type: "groupPill" },
    } as unknown as import("./types").FewerNode;
    expect(connectOrphansToRoot([root, pill], [], root.id)).toHaveLength(0);
  });
});