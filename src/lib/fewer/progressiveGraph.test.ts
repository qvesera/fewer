import { describe, expect, test } from "bun:test";
import { buildBatchGraph, buildGraphFromBatches, buildRootNode } from "./progressiveGraph";
import type { ScanBatch } from "./progressiveScan";

// Batches → nodes, keyed by the store's relative paths (T-205/206).

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
  });

  test("includeFiles false drops file nodes entirely", () => {
    const graph = buildGraphFromBatches("app", BATCHES, { includeFiles: false });
    expect(graph.nodes.every((n) => n.data.type === "folder")).toBe(true);
  });
});

describe("buildBatchGraph / buildRootNode", () => {
  test("unknown parent → orphan nodes with no edge (never crash)", () => {
    const built = buildBatchGraph("app", BATCHES[1]!, () => undefined, { includeFiles: true });
    expect(built.nodes).toHaveLength(1);
    expect(built.edges).toHaveLength(0);
  });

  test("root node is depth 0", () => {
    expect(buildRootNode("app").data.depth).toBe(0);
  });
});