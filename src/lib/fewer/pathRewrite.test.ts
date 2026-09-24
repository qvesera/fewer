import { describe, expect, test } from "bun:test";
import { rewriteConnectionPaths } from "./pathRewrite";
import { sortEdges } from "./importMerge";
import { useGraphStore } from "@/store/graphStore";
import type { FewerNode, FewerEdge } from "./types";

const node = (id: string, path = id, type: "folder" | "file" = "folder"): FewerNode => ({
  id, type, position: { x: 12, y: 34 }, selected: true,
  data: { label: id, path, type, isRoot: true },
});
const edge = (source: string, target: string): FewerEdge => ({ id: `${source}-${target}`, source, target });
const paths = (nodes: FewerNode[]) => nodes.map((n) => n.data.path);

describe("rewriteConnectionPaths", () => {
  test("rewrites a folder subtree without mutation; retains unrelated identities and positions", () => {
    const nodes = [node("parent"), node("child"), node("leaf", "child/leaf", "file"), node("other")];
    const edges = [edge("child", "leaf")];
    const original = structuredClone({ nodes, edges });
    const result = rewriteConnectionPaths(nodes, edges, "parent", "child");
    expect(paths(result.nodes)).toEqual(["parent", "parent/child", "parent/child/leaf", "other"]);
    expect(result.prevPaths).toEqual([{ nodeId: "child", path: "child" }, { nodeId: "leaf", path: "child/leaf" }]);
    expect(result.nextPaths).toEqual([{ nodeId: "child", path: "parent/child" }, { nodeId: "leaf", path: "parent/child/leaf" }]);
    expect(result.nodes[0]).toBe(nodes[0]);
    expect(result.nodes[3]).toBe(nodes[3]);
    expect(result.nodes[1].data.isRoot).toBe(false);
    expect(result.nodes[1].position).toBe(nodes[1].position);
    expect(result.nodes[1].selected).toBe(true);
    expect({ nodes, edges }).toEqual(original);
  });

  test("files keep extensions and never rewrite outgoing descendants", () => {
    const file = node("file", "file.txt", "file");
    file.data.extension = "txt";
    const nodes = [node("parent"), file, node("leaf", "file.txt/leaf")];
    const result = rewriteConnectionPaths(nodes, [edge("file", "leaf")], "parent", "file");
    expect(paths(result.nodes)).toEqual(["parent", "parent/file.txt", "file.txt/leaf"]);
    expect(result.nodes[2]).toBe(nodes[2]);
    expect(result.prevPaths).toEqual([{ nodeId: "file", path: "file.txt" }]);
  });

  test("cycles and fan-in emit each descendant once; unmatched and empty paths retain history behavior", () => {
    const nodes = [node("parent"), node("child"), node("a", "child/a"), node("b", "child/b"), node("leaf", "elsewhere"), node("empty", "")];
    const edges = [edge("child", "a"), edge("child", "b"), edge("a", "leaf"), edge("b", "leaf"), edge("leaf", "a"), edge("leaf", "child"), edge("child", "empty"), edge("child", "missing")];
    const result = rewriteConnectionPaths(nodes, edges, "parent", "child");
    expect(result.prevPaths.map((p) => p.nodeId)).toEqual(["child", "a", "b", "leaf"]);
    expect(result.nextPaths.map((p) => p.nodeId)).toEqual(["child", "a", "b", "leaf"]);
    expect(paths(result.nodes)).toEqual(["parent", "parent/child", "parent/child/a", "parent/child/b", "elsewhere", ""]);
    expect(result.nodes[4]).toBe(nodes[4]);
    expect(result.nodes[5]).toBe(nodes[5]);
  });

  test("missing endpoints leave nodes untouched and capture only existing nonempty target paths", () => {
    const nodes = [node("child")];
    const missingParent = rewriteConnectionPaths(nodes, [], "missing", "child");
    expect(missingParent).toEqual({ nodes, prevPaths: [{ nodeId: "child", path: "child" }], nextPaths: [{ nodeId: "child", path: "child" }] });
    expect(missingParent.nodes).toBe(nodes);
    const result = rewriteConnectionPaths(nodes, [], "child", "missing");
    expect(result).toEqual({ nodes, prevPaths: [], nextPaths: [] });
    expect(result.nodes).toBe(nodes);
  });
});


describe("connectNodes integration", () => {
  test("one undoable connection preserves selection, visibility, ordering and search", () => {
    const saved = useGraphStore.getState();
    const nodes = [node("parent"), node("child"), node("leaf", "child/leaf", "file")];
    const edges = [edge("child", "leaf")];
    try {
      useGraphStore.setState({ ...useGraphStore.getInitialState(), nodes, edges, selectedNodeIds: ["child"], hiddenIds: ["leaf"], categoryHiddenIds: ["leaf"], searchQuery: "child" }, true);
      const before = useGraphStore.getState();
      expect(before.connectNodes({ source: "parent", target: "child" })).toEqual({ ok: true });
      const after = useGraphStore.getState();
      expect(after.past).toHaveLength(1);
      expect(after.graphVersion).toBe(before.graphVersion + 1);
      expect(after.selectedNodeIds).toBe(before.selectedNodeIds);
      expect(after.hiddenIds).toBe(before.hiddenIds);
      expect(after.categoryHiddenIds).toBe(before.categoryHiddenIds);
      expect(after.nodes.map((n) => n.selected)).toEqual(nodes.map((n) => n.selected));
      expect(after.nodes.map((n) => n.position)).toEqual(nodes.map((n) => n.position));
      expect(after.nodes[1].data.highlighted).toBe(true);
      expect(after.nodes[0].data.dimmed).toBe(true);
      expect(after.edges).toEqual(sortEdges(after.edges, after.nodes));
      expect(paths(after.nodes)).toEqual(["parent", "parent/child", "parent/child/leaf"]);
      after.undo();
      expect(paths(useGraphStore.getState().nodes)).toEqual(paths(nodes));
      expect(useGraphStore.getState().edges).toEqual(edges);
      useGraphStore.getState().redo();
      expect(paths(useGraphStore.getState().nodes)).toEqual(paths(after.nodes));
      expect(useGraphStore.getState().edges.map((e) => e.id).sort()).toEqual(after.edges.map((e) => e.id).sort());
    } finally {
      useGraphStore.setState(saved, true);
    }
  });

  test("rejected connections do not change state or history", () => {
    const saved = useGraphStore.getState();
    try {
      useGraphStore.setState({ ...useGraphStore.getInitialState(), nodes: [node("parent"), node("file", "file", "file")], edges: [] }, true);
      const before = useGraphStore.getState();
      expect(before.connectNodes({ source: null, target: "parent" }).ok).toBe(false);
      expect(before.connectNodes({ source: "parent", target: "parent" }).ok).toBe(false);
      expect(before.connectNodes({ source: "file", target: "parent" }).ok).toBe(false);
      expect(useGraphStore.getState()).toBe(before);
    } finally {
      useGraphStore.setState(saved, true);
    }
  });
});
