import { test, expect } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import { buildSnapshot, applySnapshot, saveGraphLocal, loadGraphLocal } from "./snapshot";
import type { FewerNode, FewerEdge } from "./types";

// ─── Test harness ─────────────────────────────────────────────
// localStorage is not present in bun's test env; snapshot.ts gate-guards on
// `typeof window === "undefined"`, so stub both. Each test gets a fresh store.

function folder(id: string, label: string, x = 0, y = 0): FewerNode {
  return { id, type: "folder", position: { x, y }, data: { label, path: `/${label}`, type: "folder" } } as FewerNode;
}
function edge(source: string, target: string, id = `e-${source}-${target}`): FewerEdge {
  return { id, source, target } as FewerEdge;
}

const storage = new Map<string, string>();
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => { storage.set(k, v); },
  removeItem: (k: string) => { storage.delete(k); },
  clear: () => storage.clear(),
};

function resetStore() {
  useGraphStore.setState({
    nodes: [],
    edges: [],
    dataSource: null,
    localRootPath: null,
    direction: "TB",
    edgeStyle: "curved",
    cornerRadius: 8,
    skipNextAutoLayout: false,
  });
  storage.clear();
}

// ─── buildSnapshot ────────────────────────────────────────────
test("buildSnapshot contains graph data only — no settings", () => {
  resetStore();
  useGraphStore.setState({
    nodes: [folder("a", "A", 10, 20)],
    edges: [],
    direction: "LR",
    edgeStyle: "straight",
    themeMode: "custom",
    showMiniMap: true,
    localRootPath: "/tmp/root",
    cornerRadius: 12,
  });

  const snap = buildSnapshot();
  expect(snap.nodes).toHaveLength(1);
  expect(snap.edges).toEqual([]);
  expect(snap.localRootPath).toBe("/tmp/root");
  // Settings must not ride along with the saved graph.
  expect(Object.keys(snap).sort()).toEqual(["edges", "localRootPath", "nodes", "tags"]);
  expect("direction" in snap).toBe(false);
  expect("edgeStyle" in snap).toBe(false);
  expect("themeMode" in snap).toBe(false);
  expect("showMiniMap" in snap).toBe(false);
  expect("cornerRadius" in snap).toBe(false);
});

// ─── applySnapshot ────────────────────────────────────────────
test("applySnapshot loads nodes/edges but never touches the viewer's settings", () => {
  resetStore();
  useGraphStore.setState({ direction: "LR", edgeStyle: "straight", themeMode: "dark", cornerRadius: 12 });

  applySnapshot({
    nodes: [folder("a", "A", 40, 60)],
    edges: [],
    localRootPath: "/app/root",
  });

  const s = useGraphStore.getState();
  expect(s.nodes).toHaveLength(1);
  expect(s.nodes[0].position).toEqual({ x: 40, y: 60 }); // positions preserved
  expect(s.dataSource).toBe("saved");
  expect(s.localRootPath).toBe("/app/root");
  // The viewer's settings survive the load untouched.
  expect(s.direction).toBe("LR");
  expect(s.edgeStyle).toBe("straight");
  expect(s.themeMode).toBe("dark");
  expect(s.cornerRadius).toBe(12);
});

test("applySnapshot honours an explicit source label", () => {
  resetStore();
  applySnapshot({ nodes: [folder("a", "A")], edges: [] }, { source: "smpd" });
  expect(useGraphStore.getState().dataSource).toBe("smpd");
});

test("applySnapshot preserves saved edge list", () => {
  resetStore();
  const nodes = [folder("a", "A"), folder("b", "B")];
  const edges = [edge("a", "b")];
  applySnapshot({ nodes, edges, localRootPath: null });
  const s = useGraphStore.getState();
  expect(s.edges).toHaveLength(1);
  expect(s.edges[0].source).toBe("a");
  expect(s.edges[0].target).toBe("b");
});

// ─── saveGraphLocal / loadGraphLocal ──────────────────────────
test("local save/load round-trips the graph and its dataSource", () => {
  resetStore();
  saveGraphLocal({
    nodes: [folder("a", "A", 5, 7)],
    edges: [edge("a", "b")],
    tags: [{ id: "tag-1", label: "Important", color: "#f87171" }],
    dataSource: "sample",
    localRootPath: "/home/user/proj",
  });

  const loaded = loadGraphLocal();
  expect(loaded).not.toBeNull();
  expect(loaded!.data.nodes).toHaveLength(1);
  expect(loaded!.data.nodes[0].position).toEqual({ x: 5, y: 7 });
  expect(loaded!.data.edges).toHaveLength(1);
  expect(loaded!.data.localRootPath).toBe("/home/user/proj");
  expect(loaded!.data.tags).toEqual([{ id: "tag-1", label: "Important", color: "#f87171" }]);
  expect(loaded!.dataSource).toBe("sample");
});

test("saving an empty graph clears the cached key", () => {
  resetStore();
  saveGraphLocal({ nodes: [folder("a", "A")], edges: [], tags: [], dataSource: "sample", localRootPath: null });
  expect(loadGraphLocal()).not.toBeNull();

  saveGraphLocal({ nodes: [], edges: [], tags: [], dataSource: "sample", localRootPath: null });
  expect(loadGraphLocal()).toBeNull();
});

test("loadGraphLocal returns null for corrupt/absent caches", () => {
  resetStore();
  expect(loadGraphLocal()).toBeNull();

  storage.set("fewer-graph", "{not json");
  expect(loadGraphLocal()).toBeNull();

  storage.set("fewer-graph", JSON.stringify({ version: 999, nodes: [], edges: [] }));
  expect(loadGraphLocal()).toBeNull();

  storage.set("fewer-graph", JSON.stringify({ version: 1, nodes: "nope", edges: [] }));
  expect(loadGraphLocal()).toBeNull();
});