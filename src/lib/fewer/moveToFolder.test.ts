import { describe, test, expect } from "bun:test";
import { useGraphStore } from "@/store/createStore";
import type { FewerNode, FewerEdge } from "./types";

/**
 * Regression test for the batch "Move to Folder…" action (parentNodesTo):
 * moving selected items UP into an ancestor folder (parent/grandparent)
 * used to be silently filtered out by an over-eager ancestor check, yielding
 * "No eligible items". Moving up is legal; only true no-ops (item already a
 * direct child of the target) and cycles must be blocked.
 */

function folder(id: string, label: string, path: string): FewerNode {
  return { id, type: "folder", position: { x: 0, y: 0 }, data: { label, path, type: "folder" } };
}
function file(id: string, label: string, path: string): FewerNode {
  const ext = path.includes(".") ? path.split(".").pop() : undefined;
  return { id, type: "file", position: { x: 0, y: 0 }, data: { label, path, type: "file", extension: ext } };
}
function edge(source: string, target: string): FewerEdge {
  return { id: `e-${source}-${target}`, source, target };
}

/** grandparent > parent > child > file1..file3 */
function setup() {
  const nodes = [
    folder("gp", "grandparent", "/grandparent"),
    folder("p", "parent", "/grandparent/parent"),
    folder("c", "child", "/grandparent/parent/child"),
    file("f1", "file1", "/grandparent/parent/child/file1.txt"),
    file("f2", "file2", "/grandparent/parent/child/file2.txt"),
    file("f3", "file3", "/grandparent/parent/child/file3.txt"),
  ];
  const edges = [
    edge("gp", "p"),
    edge("p", "c"),
    edge("c", "f1"),
    edge("c", "f2"),
    edge("c", "f3"),
  ];
  useGraphStore.setState({ nodes, edges, searchQuery: "", categoryFilter: null });
}

describe("parentNodesTo — move to ancestor folders", () => {
  test("moves files up into their grandparent folder", () => {
    setup();
    const result = useGraphStore.getState().parentNodesTo(["f1", "f2", "f3"], "gp");
    expect(result.moved).toBe(3);
    const { nodes, edges } = useGraphStore.getState();
    for (const id of ["f1", "f2", "f3"]) {
      expect(edges.some((e) => e.source === "gp" && e.target === id)).toBe(true);
      expect(edges.some((e) => e.target === id && e.source === "c")).toBe(false);
    }
    // Paths rewritten to live under the new parent.
    expect(nodes.find((n) => n.id === "f1")!.data.path).toBe("/grandparent/file1.txt");
  });

  test("moves files up one level into their parent folder", () => {
    setup();
    const result = useGraphStore.getState().parentNodesTo(["f1"], "p");
    expect(result.moved).toBe(1);
    expect(useGraphStore.getState().nodes.find((n) => n.id === "f1")!.data.path).toBe(
      "/grandparent/parent/file1.txt",
    );
  });

  test("no-ops with a clear reason when items are already direct children of the target", () => {
    setup();
    const result = useGraphStore.getState().parentNodesTo(["f1"], "c");
    expect(result.moved).toBe(0);
    expect(result.reason).toContain("already");
  });

  test("refuses to move a folder into its own descendant (cycle)", () => {
    setup();
    const result = useGraphStore.getState().parentNodesTo(["gp"], "c");
    expect(result.moved).toBe(0);
  });

  test("moving a subtree up keeps descendants attached and rewrites their paths", () => {
    setup();
    const result = useGraphStore.getState().parentNodesTo(["c"], "gp");
    expect(result.moved).toBe(1);
    const { edges, nodes } = useGraphStore.getState();
    expect(edges.some((e) => e.source === "gp" && e.target === "c")).toBe(true);
    expect(edges.some((e) => e.source === "c" && e.target === "f1")).toBe(true);
    expect(nodes.find((n) => n.id === "f2")!.data.path).toBe("/grandparent/child/file2.txt");
  });

  test("move is undoable in one step", () => {
    setup();
    useGraphStore.getState().parentNodesTo(["f1", "f2", "f3"], "p");
    useGraphStore.getState().undo();
    const { edges } = useGraphStore.getState();
    for (const id of ["f1", "f2", "f3"]) {
      expect(edges.some((e) => e.source === "c" && e.target === id)).toBe(true);
      expect(edges.some((e) => e.source === "p" && e.target === id)).toBe(false);
    }
  });
});
