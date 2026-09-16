import { describe, expect, test } from "bun:test";
import { mergeImportedGraph, sortEdges } from "./importMerge";
import { useGraphStore } from "@/store/graphStore";
import type { FewerNode, FewerEdge } from "./types";

const node = (id: string, type: "folder" | "file", selected = false): FewerNode => ({
  id, type, position: { x: 0, y: 0 }, selected, data: { label: id, path: id, type },
});
const edge = (id: string, target: string, zIndex = 0): FewerEdge => ({ id, source: "root", target, zIndex });

describe("import merge", () => {
  test("deselects existing nodes without mutation and preserves imported selection and identity", () => {
    const existing = node("root", "folder", true);
    const imported = node("new", "file", true);
    const nodes = [existing];
    const edges: FewerEdge[] = [];
    const addedEdge = edge("added", "new");
    const result = mergeImportedGraph(nodes, edges, [imported], [addedEdge]);
    expect(existing.selected).toBe(true);
    expect(result.nodes[0].selected).toBe(false);
    expect(result.nodes[0].data).toBe(existing.data);
    expect(result.nodes[1]).toBe(imported);
    expect(result.edges).toEqual([addedEdge]);
    expect(nodes).toEqual([existing]);
    expect(edges).toEqual([]);
  });
  test("retains painter order and stable ties, including missing targets", () => {
    const nodes = [node("folder", "folder"), node("a", "file"), node("z", "file")];
    const edges = [edge("folder", "folder"), edge("raised", "a", 10), edge("normal", "a"), edge("z", "z"), edge("missing", "missing"), edge("tie", "a")];
    expect(sortEdges(edges, nodes).map((e) => e.id)).toEqual(["z", "normal", "tie", "raised", "missing", "folder"]);
    expect(edges[0].id).toBe("folder");
  });
  test("empty merge stays empty", () => {
    expect(mergeImportedGraph([], [], [], [])).toEqual({ nodes: [], edges: [] });
  });
  test("duplicate action keeps selection, graph version and one undoable import", () => {
    const saved = useGraphStore.getState();
    try {
      useGraphStore.setState({ ...useGraphStore.getInitialState(), nodes: [node("root", "folder", true)], edges: [], selectedNodeIds: ["root"] });
      const before = useGraphStore.getState();
      before.duplicateNodeUnderParent("root");
      const after = useGraphStore.getState();
      expect(after.nodes).toHaveLength(2);
      expect(after.selectedNodeIds).toHaveLength(1);
      expect(after.selectedNodeIds[0]).not.toBe("root");
      expect(after.graphVersion).toBe(before.graphVersion + 1);
      after.undo();
      expect(useGraphStore.getState().nodes.map((n) => n.id)).toEqual(["root"]);
    } finally {
      useGraphStore.setState(saved, true);
    }
  });
});
