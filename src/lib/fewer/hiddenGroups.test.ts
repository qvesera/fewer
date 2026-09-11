import { test, describe, expect } from "bun:test";
import {
  getHiddenLayerGroups,
  filterHiddenGroups,
  ancestorChain,
  buildRingIds,
} from "./hiddenGroups";
import type { FewerNode, FewerEdge } from "./types";

function makeNode(id: string, label: string, parentId?: string | null, opts: Partial<FewerNode["data"]> = {}): FewerNode {
  return {
    id,
    type: "folder",
    position: { x: 0, y: 0 },
    data: { label, path: parentId ? `/${label}` : `/${label}`, type: "folder", parentId: parentId ?? null, ...opts },
    style: { width: 200, height: 120 },
  } as FewerNode;
}

function makeFile(id: string, label: string, parentId: string): FewerNode {
  return {
    id,
    type: "file",
    position: { x: 0, y: 0 },
    data: { label, path: `/${parentId}/${label}`, type: "file", parentId, category: "text" },
    style: { width: 140, height: 50 },
  } as FewerNode;
}

function makeEdge(id: string, source: string, target: string): FewerEdge {
  return { id, source, target, type: "smoothstep" } as FewerEdge;
}

describe("getHiddenLayerGroups", () => {
  test("groups individually hidden files under their visible parent folder", () => {
    // root -> [docs, src]; docs -> a.md, b.md ; src -> c.ts
    const nodes: FewerNode[] = [
      makeNode("root", "root", null, { isRoot: true }),
      makeNode("docs", "docs", "root"),
      makeNode("src", "src", "root"),
      makeFile("a", "a.md", "docs"),
      makeFile("b", "b.md", "docs"),
      makeFile("c", "c.ts", "src"),
    ];
    const edges: FewerEdge[] = [
      makeEdge("e1", "root", "docs"),
      makeEdge("e2", "root", "src"),
      makeEdge("e3", "docs", "a"),
      makeEdge("e4", "docs", "b"),
      makeEdge("e5", "src", "c"),
    ];
    // Only the three files are hidden, not their folders.
    const groups = getHiddenLayerGroups(nodes, edges, ["a", "b", "c"]);

    expect(groups).toHaveLength(2);
    // A→Z by folder label: "docs" then "src"
    expect(groups[0].parentNode!.data.label).toBe("docs");
    expect(groups[0].hiddenCount).toBe(2);
    expect(groups[0].roots.map((r) => r.node.id).sort()).toEqual(["a", "b"]);
    expect(groups[1].parentNode!.data.label).toBe("src");
    expect(groups[1].hiddenCount).toBe(1);
    expect(groups[1].roots[0].node.id).toBe("c");
    // The parent folder is visible, so roots are not nested folders.
    expect(groups[0].roots[0].children).toHaveLength(0);
  });

  test("keeps an entirely-hidden subtree nested under its hidden folder root", () => {
    const nodes: FewerNode[] = [
      makeNode("root", "root", null, { isRoot: true }),
      makeNode("outer", "outer", "root"),
      makeFile("f1", "f1.txt", "outer"),
    ];
    const edges: FewerEdge[] = [
      makeEdge("e1", "root", "outer"),
      makeEdge("e2", "outer", "f1"),
    ];
    // Hidden subtree: outer + f1.
    const groups = getHiddenLayerGroups(nodes, edges, ["outer", "f1"]);

    expect(groups).toHaveLength(1);
    // Cases where the hidden root's own parent is hidden → parent is a hidden one,
    // so nearest visible is "root". The hidden folder stays a root with nested child.
    expect(groups[0].parentNode!.data.label).toBe("root");
    expect(groups[0].hiddenCount).toBe(2);
    const outer = groups[0].roots[0];
    expect(outer.node.id).toBe("outer");
    expect(outer.children.map((c) => c.node.id)).toEqual(["f1"]);
  });

  test("stale hidden ids (deleted nodes) are ignored without throwing", () => {
    const nodes: FewerNode[] = [makeNode("root", "root", null, { isRoot: true })];
    const edges: FewerEdge[] = [];
    const groups = getHiddenLayerGroups(nodes, edges, ["ghost"]);
    expect(groups).toEqual([]);
  });
});

describe("filterHiddenGroups", () => {
  test("folder label match keeps the whole group", () => {
    const nodes: FewerNode[] = [
      makeNode("root", "root", null, { isRoot: true }),
      makeNode("docs", "docs", "root"),
      makeFile("a", "a.md", "docs"),
      makeFile("zebra", "zebra.txt", "docs"),
    ];
    const edges: FewerEdge[] = [makeEdge("e1", "root", "docs"), makeEdge("e2", "docs", "a"), makeEdge("e3", "docs", "zebra")];
    const groups = getHiddenLayerGroups(nodes, edges, ["a", "zebra"]);
    const filtered = filterHiddenGroups(groups, "docs");
    expect(filtered).toHaveLength(1);
    // Whole group retained.
    expect(filtered[0].roots).toHaveLength(2);
  });

  test("root label match keeps only that root", () => {
    const nodes: FewerNode[] = [
      makeNode("root", "root", null, { isRoot: true }),
      makeNode("docs", "docs", "root"),
      makeFile("a", "alpha.md", "docs"),
      makeFile("b", "beta.md", "docs"),
    ];
    const edges: FewerEdge[] = [makeEdge("e1", "root", "docs"), makeEdge("e2", "docs", "a"), makeEdge("e3", "docs", "b")];
    const groups = getHiddenLayerGroups(nodes, edges, ["a", "b"]);
    const filtered = filterHiddenGroups(groups, "alpha");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].roots.map((r) => r.node.id)).toEqual(["a"]);
  });
});

describe("ancestorChain", () => {
  test("walks parent links to the root", () => {
    const edges: FewerEdge[] = [
      makeEdge("e1", "root", "outer"),
      makeEdge("e2", "outer", "inner"),
    ];
    expect(ancestorChain("inner", edges)).toEqual(["outer", "root"]);
    expect(ancestorChain("outer", edges)).toEqual(["root"]);
    expect(ancestorChain("root", edges)).toEqual([]);
  });
});

describe("buildRingIds", () => {
  const edges: FewerEdge[] = [
    makeEdge("e1", "root", "docs"),
    makeEdge("e2", "docs", "a"),
  ];

  test("rings the node plus its full ancestor chain", () => {
    expect(buildRingIds("a", edges)).toEqual(["a", "docs", "root"]);
    expect(buildRingIds("docs", edges)).toEqual(["docs", "root"]);
    expect(buildRingIds("root", edges)).toEqual(["root"]);
  });

  test("null/undefined node id rings nothing (standalone group header)", () => {
    expect(buildRingIds(null, edges)).toEqual([]);
    expect(buildRingIds(undefined, edges)).toEqual([]);
  });

  test("subtree roots flatten every descendant into the ring set", () => {
    // Hidden folder subtree: outer -> [f1, f2 -> deep]
    const nodes: FewerNode[] = [
      makeNode("outer", "outer", "root"),
      makeFile("f1", "f1.txt", "outer"),
      makeFile("f2", "f2.txt", "outer"),
    ];
    const tree = {
      node: nodes[0],
      children: [
        { node: nodes[1], children: [] },
        { node: nodes[2], children: [{ node: makeFile("deep", "deep.md", "f2"), children: [] }] },
      ],
    };
    const ids = buildRingIds("docs", edges, [tree]);
    expect(ids).toContain("docs");
    expect(ids).toContain("root");
    expect(ids).toContain("outer");
    expect(ids).toContain("f1");
    expect(ids).toContain("f2");
    expect(ids).toContain("deep");
  });

  test("no subtree roots → just node + ancestors", () => {
    expect(buildRingIds("a", edges, [])).toEqual(["a", "docs", "root"]);
  });
});
