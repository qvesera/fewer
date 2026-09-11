import { test, expect, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/createStore";
import type { FewerNode, FewerEdge } from "./types";

function makeFolder(id: string, x: number, y: number, w = 240, h = 200): FewerNode {
  return { id, type: "folder", position: { x, y }, data: { label: id, path: id, type: "folder", size: 0, depth: 0, isRoot: true }, style: { width: w, height: h } } as FewerNode;
}

function makeFile(id: string, x: number, y: number, w = 220): FewerNode {
  return { id, type: "file", position: { x, y }, data: { label: id, path: id, type: "file", extension: "txt", category: "text", size: 10, depth: 0, isRoot: true }, style: { width: w } } as FewerNode;
}

function aabbOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, padding = 0) {
  return !(a.x + a.w + padding < b.x || a.x > b.x + b.w + padding || a.y + a.h + padding < b.y || a.y > b.y + b.h + padding);
}

beforeEach(() => {
  useGraphStore.setState({ nodes: [], edges: [], past: [], future: [], selectedNodeIds: [], hiddenIds: [], autoHiddenIds: [] });
});

test("_findCreationPosition: exact placement in clear space", () => {
  const pos = useGraphStore.getState()._findCreationPosition(500, 500, 240, 58);
  expect(pos).toEqual({ x: 500, y: 500 });
});

test("addNode with drop position: lands at cursor when no collision", () => {
  useGraphStore.setState({ nodes: [makeFolder("root", 0, 0)], edges: [], nodeWidth: 240, nodeHeight: 200 });
  const id = useGraphStore.getState().addNode("root", "child", "file", { x: 2000, y: 2000 });
  const n = useGraphStore.getState().nodes.find((nd) => nd.id === id)!;
  // Centered on cursor: 2000 - 110, 2000 - 29
  expect(n.position).toEqual({ x: 1880, y: 1971 });
});

test("addNode with drop position near folder: placed at cursor (no 40px padding displacement)", () => {
  useGraphStore.setState({ nodes: [makeFolder("root", 0, 0, 240, 200)], edges: [], nodeWidth: 240, nodeHeight: 200 });
  const id = useGraphStore.getState().addNode("root", "child", "file", { x: 120, y: 250 });
  const n = useGraphStore.getState().nodes.find((nd) => nd.id === id)!;
  // rawPos = (0, 221). Folder padded bottom = 212. 221 > 212 → no overlap → exact
  expect(n.position).toEqual({ x: 0, y: 221 });
});

test("addNode with drop overlapping folder: nudged, never overlaps", () => {
  useGraphStore.setState({ nodes: [makeFolder("root", 0, 0, 240, 200)], edges: [], nodeWidth: 240, nodeHeight: 200 });
  const id = useGraphStore.getState().addNode("root", "child", "file", { x: 120, y: 100 });
  const n = useGraphStore.getState().nodes.find((nd) => nd.id === id)!;
  const fileAabb = { x: n.position.x, y: n.position.y, w: 240, h: 58 };
  const folderAabb = { x: 0, y: 0, w: 240, h: 200 };
  expect(aabbOverlap(fileAabb, folderAabb, 12)).toBe(false);
});

test("addStandaloneNode: never overlaps existing nodes", () => {
  useGraphStore.setState({ nodes: [makeFolder("root", 0, 0, 240, 200)], edges: [], nodeWidth: 240, nodeHeight: 200 });
  const id = useGraphStore.getState().addStandaloneNode("solo", "file", { x: 120, y: 100 });
  const n = useGraphStore.getState().nodes.find((nd) => nd.id === id)!;
  const fileAabb = { x: n.position.x, y: n.position.y, w: 240, h: 58 };
  const folderAabb = { x: 0, y: 0, w: 240, h: 200 };
  expect(aabbOverlap(fileAabb, folderAabb, 12)).toBe(false);
});

test("addParentNode with drop position: never overlaps existing nodes", () => {
  useGraphStore.setState({ nodes: [makeFolder("root", 0, 0, 240, 200), makeFile("f1", 100, 300)], edges: [{ id: "e1", source: "root", target: "f1", type: "smoothstep" }], nodeWidth: 240, nodeHeight: 200 });
  const result = useGraphStore.getState().addParentNode("f1", "parent", { x: 100, y: 280 });
  expect(result.ok).toBe(true);
  const n = useGraphStore.getState().nodes.find((nd) => nd.id === result.id)!;
  // Folder 240×200 centered at (100,280)
  const newAabb = { x: n.position.x, y: n.position.y, w: 240, h: 200 };
  expect(aabbOverlap(newAabb, { x: 0, y: 0, w: 240, h: 200 }, 12)).toBe(false);
  expect(aabbOverlap(newAabb, { x: 100, y: 300, w: 240, h: 58 }, 12)).toBe(false);
});

test("hidden nodes are ignored for collision", () => {
  useGraphStore.setState({ nodes: [makeFolder("root", 0, 0, 240, 200), makeFile("h1", 500, 500)], edges: [], nodeWidth: 240, nodeHeight: 200, hiddenIds: ["h1"] });
  const pos = useGraphStore.getState()._findCreationPosition(500, 500, 240, 58);
  // h1 is hidden → no collision at (500,500) even though h1 sits there
  expect(pos).toEqual({ x: 500, y: 500 });
});
