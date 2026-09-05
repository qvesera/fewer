import { test, expect, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/createStore";
import type { FewerNode, FewerEdge } from "./types";

function makeFolder(id: string, label: string, path: string, extra: Partial<FewerNode["data"]> = {}): FewerNode {
  return {
    id,
    type: "folder",
    position: { x: 0, y: 0 },
    data: { label, path, type: "folder", size: 0, depth: 0, isRoot: true, ...extra },
    style: { width: 260, height: 180 },
  } as FewerNode;
}

function makeFile(id: string, label: string, path: string, extra: Partial<FewerNode["data"]> = {}): FewerNode {
  return {
    id,
    type: "file",
    position: { x: 0, y: 0 },
    data: { label, path, type: "file", extension: "txt", category: "text", size: 10, depth: 0, isRoot: true, ...extra },
    style: { width: 260 },
  } as FewerNode;
}

function makeEdge(id: string, source: string, target: string): FewerEdge {
  return { id, source, target, type: "smoothstep" } as FewerEdge;
}

function seed(nodes: FewerNode[], edges: FewerEdge[]) {
  useGraphStore.setState({ nodes, edges, past: [], future: [], selectedNodeIds: [] });
}

beforeEach(() => {
  useGraphStore.setState({ nodes: [], edges: [], past: [], future: [], selectedNodeIds: [] });
});

test("addParentNode wraps a root node in a new folder", () => {
  seed([makeFolder("x", "x", "/x")], []);

  const res = useGraphStore.getState().addParentNode("x", "wrapper");
  expect(res.ok).toBe(true);

  const { nodes, edges } = useGraphStore.getState();
  expect(nodes.map((n) => n.id).sort()).toEqual(["x", res.id].sort());

  const folder = nodes.find((n) => n.id === res.id)!;
  expect(folder.data.type).toBe("folder");
  expect(folder.data.path).toBe("wrapper");
  expect(folder.data.isRoot).toBe(true);

  expect(edges.length).toBe(1);
  expect(edges[0].source).toBe(res.id);
  expect(edges[0].target).toBe("x");

  const x = nodes.find((n) => n.id === "x")!;
  expect(x.data.path).toBe("wrapper/x");
  expect(x.data.isRoot).toBe(false);
});

test("addParentNode inserts a folder between a node and its existing parent, rewriting paths", () => {
  const root = makeFolder("root", "root", "/root", { isRoot: true });
  const a = makeFolder("a", "a", "/root/a", { isRoot: false, depth: 1 });
  const b = makeFolder("b", "b", "/root/a/b", { isRoot: false, depth: 2 });
  seed([root, a, b], [makeEdge("e1", "root", "a"), makeEdge("e2", "a", "b")]);

  const res = useGraphStore.getState().addParentNode("a", "mid");
  expect(res.ok).toBe(true);

  const { nodes, edges } = useGraphStore.getState();
  const byId = (id: string) => nodes.find((n) => n.id === id)!;

  expect(byId(res.id!).data.path).toBe("/root/mid");
  expect(byId(res.id!).data.depth).toBe(1);
  expect(byId("a").data.path).toBe("/root/mid/a");
  expect(byId("b").data.path).toBe("/root/mid/a/b");

  // Old parent edge removed; folder now bridges root → mid → a → b.
  expect(edges.some((e) => e.source === "root" && e.target === "a")).toBe(false);
  expect(edges.some((e) => e.source === "root" && e.target === res.id)).toBe(true);
  expect(edges.some((e) => e.source === res.id && e.target === "a")).toBe(true);
  expect(edges.some((e) => e.source === "a" && e.target === "b")).toBe(true);
});

test("addParentNode works on file nodes", () => {
  seed([makeFile("f", "notes", "/notes.txt")], []);

  const res = useGraphStore.getState().addParentNode("f", "docs");
  expect(res.ok).toBe(true);

  const { nodes, edges } = useGraphStore.getState();
  expect(edges.some((e) => e.source === res.id && e.target === "f")).toBe(true);
  expect(nodes.find((n) => n.id === "f")!.data.path).toBe("docs/notes.txt");
  expect(nodes.find((n) => n.id === res.id)!.data.type).toBe("folder");
});

test("addParentNode rejects duplicate sibling names", () => {
  seed([makeFolder("x", "x", "/x"), makeFolder("y", "y", "/y")], []);

  const res = useGraphStore.getState().addParentNode("x", "y");
  expect(res.ok).toBe(false);

  const { nodes, edges } = useGraphStore.getState();
  expect(nodes.length).toBe(2); // unchanged
  expect(edges.length).toBe(0);
});

test("addParentNode rejects a missing node", () => {
  seed([makeFolder("x", "x", "/x")], []);

  const res = useGraphStore.getState().addParentNode("ghost", "wrapper");
  expect(res.ok).toBe(false);
});

test("undo restores the original graph and redo re-applies the parent", () => {
  const root = makeFolder("root", "root", "/root", { isRoot: true });
  const a = makeFolder("a", "a", "/root/a", { isRoot: false, depth: 1 });
  const b = makeFolder("b", "b", "/root/a/b", { isRoot: false, depth: 2 });
  seed([root, a, b], [makeEdge("e1", "root", "a"), makeEdge("e2", "a", "b")]);

  const res = useGraphStore.getState().addParentNode("a", "mid");
  const midId = res.id!;

  useGraphStore.getState().undo();
  let s = useGraphStore.getState();
  expect(s.nodes.find((n) => n.id === midId)).toBeUndefined();
  expect(s.edges.some((e) => e.source === "root" && e.target === "a")).toBe(true);
  expect(s.edges.some((e) => e.source === midId)).toBe(false);
  expect(s.nodes.find((n) => n.id === "a")!.data.path).toBe("/root/a");
  expect(s.nodes.find((n) => n.id === "b")!.data.path).toBe("/root/a/b");

  useGraphStore.getState().redo();
  s = useGraphStore.getState();
  expect(s.nodes.find((n) => n.id === midId)).toBeDefined();
  expect(s.edges.some((e) => e.source === "root" && e.target === midId)).toBe(true);
  expect(s.edges.some((e) => e.source === midId && e.target === "a")).toBe(true);
  expect(s.nodes.find((n) => n.id === "a")!.data.path).toBe("/root/mid/a");
  expect(s.nodes.find((n) => n.id === "b")!.data.path).toBe("/root/mid/a/b");
});