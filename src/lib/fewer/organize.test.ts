import { describe, expect, it, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import type { FewerNode, FewerEdge } from "./types";

const FW = 240, FH = 200, CW = 220, CH = 58;

function makeNode(id: string, type: "folder" | "file"): FewerNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { label: id, path: `/${id}`, type },
    style: type === "folder" ? { width: FW, height: FH } : { width: CW, height: CH },
  } as FewerNode;
}

function makeEdge(source: string, target: string): FewerEdge {
  return { id: `e-${source}-${target}`, source, target } as FewerEdge;
}

/** root → 4 folders, each with 6 files — wide enough that Crown Shyness moves cards. */
function seedTree() {
  const nodes: FewerNode[] = [makeNode("root", "folder")];
  const edges: FewerEdge[] = [];
  for (let i = 0; i < 4; i++) {
    nodes.push(makeNode(`dir${i}`, "folder"));
    edges.push(makeEdge("root", `dir${i}`));
    for (let j = 0; j < 6; j++) {
      nodes.push(makeNode(`dir${i}-f${j}`, "file"));
      edges.push(makeEdge(`dir${i}`, `dir${i}-f${j}`));
    }
  }
  return { nodes, edges };
}

/** Every card parked off in a corner: any real layout pass moves them away. */
function parkNodes(nodes: FewerNode[]): FewerNode[] {
  return nodes.map((n) => ({ ...n, position: { x: 99999, y: 99999 } }));
}

function folderSpread(): number {
  const xs = useGraphStore.getState().nodes
    .filter((n) => n.data.type === "folder" && n.id !== "root")
    .map((n) => n.position.x)
    .sort((a, b) => a - b);
  return xs[xs.length - 1] - xs[0];
}

beforeEach(() => {
  const { nodes, edges } = seedTree();
  useGraphStore.setState({
    nodes,
    edges,
    viewSettings: {},
    activeLeafId: null,
    hiddenIds: [],
    selectedNodeIds: [],
    direction: "TB",
    hiddenFileIds: [],
    tagFilter: null,
    shynessScale: 1,
    sortKey: "name",
    sortDir: "asc",
    tags: [],
  });
});

describe("organize", () => {
  it("relayouts the shared layout when no view is given", () => {
    useGraphStore.setState({ nodes: parkNodes(useGraphStore.getState().nodes) });
    useGraphStore.getState().organize(null);
    expect(useGraphStore.getState().nodes.every((n) => n.position.x !== 99999)).toBe(true);
  });

  it("relayouts the shared layout for a view that only holds per-view positions", () => {
    // The trap that made Organize inert: a view entry exists, so the old guard
    // cleared positions (or did nothing) and never re-ran the layout.
    useGraphStore.setState({
      nodes: parkNodes(useGraphStore.getState().nodes),
      viewSettings: { leafA: { positions: { root: { x: 10, y: 10 } } } },
    });
    useGraphStore.getState().organize("leafA");

    const s = useGraphStore.getState();
    expect(s.viewSettings.leafA?.positions).toBeUndefined();
    expect(s.nodes.every((n) => n.position.x !== 99999)).toBe(true);
  });

  it("still reorganises when the view entry only holds undefined keys", () => {
    // updateViewSettings writes `positions: undefined`, leaving the key behind.
    useGraphStore.setState({
      nodes: parkNodes(useGraphStore.getState().nodes),
      viewSettings: { leafA: { positions: undefined, direction: undefined } },
    });
    useGraphStore.getState().organize("leafA");
    expect(useGraphStore.getState().nodes.every((n) => n.position.x !== 99999)).toBe(true);
  });

  it("lets a view with its own direction re-derive without touching shared positions", () => {
    const parked = parkNodes(useGraphStore.getState().nodes);
    useGraphStore.setState({
      nodes: parked,
      viewSettings: { leafA: { direction: "LR", positions: { root: { x: 10, y: 10 } } } },
    });
    useGraphStore.getState().organize("leafA");

    const s = useGraphStore.getState();
    expect(s.viewSettings.leafA?.positions).toBeUndefined(); // positions dropped → canvas re-derives
    expect(s.nodes.every((n) => n.position.x === 99999)).toBe(true); // shared layout untouched
  });

  it("applies the current Crown Shyness intensity to the shared layout", () => {
    useGraphStore.getState().setShynessScale(0);
    useGraphStore.getState().organize(null);
    const flat = folderSpread();

    useGraphStore.getState().setShynessScale(3);
    useGraphStore.getState().organize(null);
    const shier = folderSpread();

    expect(shier).toBeGreaterThan(flat);
  });
});