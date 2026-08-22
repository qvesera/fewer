import { test, expect } from "bun:test";
import { layoutGraphSync, shynessGap, SHYNESS_DEPTH_K, SHYNESS_SIZE_K, SHYNESS_MAX_MULTIPLE } from "./layout";
import type { FewerNode, FewerEdge } from "./types";

function makeNode(id: string, label: string, w: number, h: number): FewerNode {
  const type = "folder";
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { label, path: `/${label}`, type },
    style: { width: w, height: h },
  } as unknown as FewerNode;
}

function makeEdge(source: string, target: string): FewerEdge {
  return { id: `${source}-${target}`, source, target } as FewerEdge;
}

const FW = 240, FH = 200; // folder
const CW = 220, CH = 58; // file-style leaf

// root -> a -> a1 -> {a1x,a1y}, a -> a2, b -> b1 -> {b1x,b1y}, b -> b2
function bushyTree(): { nodes: FewerNode[]; edges: FewerEdge[] } {
  const nodes = [
    makeNode("root", "root", FW, FH),
    makeNode("a", "a", FW, FH),
    makeNode("b", "b", FW, FH),
    makeNode("a1", "a1", FW, FH),
    makeNode("a2", "a2", CW, CH),
    makeNode("b1", "b1", FW, FH),
    makeNode("b2", "b2", CW, CH),
    makeNode("a1x", "a1x", CW, CH),
    makeNode("a1y", "a1y", CW, CH),
    makeNode("b1x", "b1x", CW, CH),
    makeNode("b1y", "b1y", CW, CH),
  ];
  const edges = [
    makeEdge("root", "a"),
    makeEdge("root", "b"),
    makeEdge("a", "a1"),
    makeEdge("a", "a2"),
    makeEdge("b", "b1"),
    makeEdge("b", "b2"),
    makeEdge("a1", "a1x"),
    makeEdge("a1", "a1y"),
    makeEdge("b1", "b1x"),
    makeEdge("b1", "b1y"),
  ];
  return { nodes, edges };
}

test("shynessGap: exact base value at depth 0 for minimal crowns", () => {
  // d=0, both crowns are single nodes: base + sizeK*log2(2)
  expect(shynessGap(60, 0, 1, 1)).toBeCloseTo(60 + SHYNESS_SIZE_K * 1);
});

test("shynessGap: grows with crown depth and crown size", () => {
  const g0 = shynessGap(60, 0, 1, 1);
  expect(shynessGap(60, 1, 1, 1)).toBeCloseTo(g0 + SHYNESS_DEPTH_K);
  expect(shynessGap(60, 3, 1, 1)).toBeCloseTo(g0 + 3 * SHYNESS_DEPTH_K);
  // bigger crowns on both sides -> more shy
  expect(shynessGap(60, 0, 50, 50)).toBeGreaterThan(shynessGap(60, 0, 1, 1));
  // gap scales with the SMALLER crown (small crown next to giant stays reasonable)
  expect(shynessGap(60, 0, 1, 1000)).toBeCloseTo(shynessGap(60, 0, 1, 1));
});

test("shynessGap: capped at max multiple of base gap", () => {
  expect(shynessGap(60, 100, 1000, 1000)).toBe(60 * SHYNESS_MAX_MULTIPLE);
});

test("shynessGap: scale multiplies the extra shyness only", () => {
  const base = 60;
  const extra = SHYNESS_DEPTH_K * 2 + SHYNESS_SIZE_K * Math.log2(1 + 5);
  expect(shynessGap(base, 2, 5, 5, 0)).toBe(base); // 0 = flat gaps
  expect(shynessGap(base, 2, 5, 5, 1)).toBe(base + extra);
  expect(shynessGap(base, 2, 5, 5, 2)).toBe(base + 2 * extra);
});

test("layout: shynessScale=0 matches shyness off; scale 2 doubles the extra spread", () => {
  const build = () => {
    const nodes = [
      makeNode("root", "root", 100, 100),
      makeNode("a", "a", 100, 100),
      makeNode("b", "b", 100, 100),
      makeNode("a1", "a1", 140, 58),
      makeNode("b1", "b1", 140, 58),
    ];
    const edges = [makeEdge("root", "a"), makeEdge("root", "b"), makeEdge("a", "a1"), makeEdge("b", "b1")];
    return { nodes, edges };
  };
  const dist = (laid: FewerNode[], x: string, y: string) =>
    Math.abs(laid.find((n) => n.id === y)!.position.x - laid.find((n) => n.id === x)!.position.x);
  const flat = layoutGraphSync(build().nodes, build().edges, "TB", { shyness: false });
  const zero = layoutGraphSync(build().nodes, build().edges, "TB", { shyness: true, shynessScale: 0 });
  const one = layoutGraphSync(build().nodes, build().edges, "TB", { shyness: true, shynessScale: 1 });
  const two = layoutGraphSync(build().nodes, build().edges, "TB", { shyness: true, shynessScale: 2 });
  expect(dist(zero, "a", "b")).toBe(dist(flat, "a", "b")); // 0 == off
  expect(dist(two, "a", "b")).toBeGreaterThan(dist(one, "a", "b")); // more scale -> shier
});

test("layout: shyness pushes sibling crowns further apart than flat gaps", () => {
  // Tree: root -> {a, b}, a and b each have one wide child (wider than parents
  // so the deep contour level binds the sibling shift).
  const build = () => {
    const nodes = [
      makeNode("root", "root", 100, 100),
      makeNode("a", "a", 100, 100),
      makeNode("b", "b", 100, 100),
      makeNode("a1", "a1", 140, 58),
      makeNode("b1", "b1", 140, 58),
    ];
    const edges = [makeEdge("root", "a"), makeEdge("root", "b"), makeEdge("a", "a1"), makeEdge("b", "b1")];
    return { nodes, edges };
  };
  const centerDistance = (laid: FewerNode[], x: string, y: string) => {
    const p = (id: string) => laid.find((n) => n.id === id)!.position;
    return Math.abs(p(y).x - p(x).x);
  };

  const on = layoutGraphSync(build().nodes, build().edges, "TB", { shyness: true });
  const off = layoutGraphSync(build().nodes, build().edges, "TB", { shyness: false });

  // Binding constraint sits at contour level 1 (wide children): shyness adds
  // DEPTH_K for that level, so crowns sit visibly further apart.
  expect(centerDistance(on, "a", "b")).toBeGreaterThan(centerDistance(off, "a", "b"));
  expect(centerDistance(on, "a1", "b1")).toBeGreaterThan(centerDistance(off, "a1", "b1"));
  // With shyness off the flat gap applies at every level equally.
  expect(centerDistance(off, "a", "b")).toBe(centerDistance(off, "a1", "b1"));
});

test("layout: bigger crowns are shier — deep subtree pairs space out more", () => {
  // t1: two leaf siblings. t2: two siblings that each head a 6-node chain.
  const chain = (prefix: string, depth: number) => {
    const nodes: FewerNode[] = [makeNode("root", "root", 100, 100)];
    const edges: FewerEdge[] = [];
    for (const side of ["a", "b"]) {
      let prev = "root";
      for (let i = 0; i < depth; i++) {
        const id = `${side}${i}`;
        nodes.push(makeNode(id, id, 100, 100));
        edges.push(makeEdge(prev, id));
        prev = id;
      }
    }
    return { nodes, edges };
  };
  const c1 = chain("", 1);
  const c6 = chain("", 6);
  const small = layoutGraphSync(c1.nodes, c1.edges, "TB", { shyness: true });
  const big = layoutGraphSync(c6.nodes, c6.edges, "TB", { shyness: true });
  const spread = (laid: FewerNode[], a: string, b: string) =>
    Math.abs(laid.find((n) => n.id === b)!.position.x - laid.find((n) => n.id === a)!.position.x);
  expect(spread(big, "a0", "b0")).toBeGreaterThan(spread(small, "a0", "b0"));
});

test("layout: no node overlaps anywhere with shyness on", () => {
  const { nodes, edges } = bushyTree();
  for (const direction of ["TB", "LR"] as const) {
    const laid = layoutGraphSync(nodes, edges, direction, { shyness: true });
    const boxes = laid.map((n) => ({
      id: n.id,
      x1: n.position.x,
      y1: n.position.y,
      x2: n.position.x + ((n.style?.width as number) ?? 0),
      y2: n.position.y + ((n.style?.height as number) ?? 0),
    }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const overlaps = a.x1 < b.x2 - 0.5 && b.x1 < a.x2 - 0.5 && a.y1 < b.y2 - 0.5 && b.y1 < a.y2 - 0.5;
        expect(overlaps).toBe(false);
      }
    }
  }
});
