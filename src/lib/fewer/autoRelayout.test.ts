import { describe, expect, it, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import { applyUserSettings } from "./userSettings";
import type { FewerNode, FewerEdge } from "./types";

/**
 * `autoRelayout` (Advanced → Layout Policy → Auto-relayout).
 *
 * Showing, revealing and bulk-revealing cards re-ran the layout, so a session
 * full of those actions kept rearranging the tree under the user. Off, they
 * change only what is visible and the arrangement stays. Hiding never re-flowed
 * (a hidden card just leaves its slot), which is why the gate sits on the show
 * and folder-bulk paths only. What must NOT be gated: anything the user
 * explicitly asked to re-flow — Organize and Sort — or the control would read
 * as broken.
 *
 * The trick is the sentinel: park every card at 99999,99999 and ask whether a
 * layout pass ran. Moved means a pass happened; still parked means it did not.
 */

const FW = 240, FH = 200, CW = 220, CH = 58;
const PARKED = 99999;

function makeNode(id: string, type: "folder" | "file", size = 0): FewerNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { label: id, path: `/${id}`, type, size, depth: 1 },
    style: type === "folder" ? { width: FW, height: FH } : { width: CW, height: CH },
  } as unknown as FewerNode;
}

function makeEdge(source: string, target: string): FewerEdge {
  return { id: `e-${source}-${target}`, source, target } as unknown as FewerEdge;
}

/** root → 3 folders × 4 files: enough for a pass to move everything. */
function seedTree() {
  const nodes: FewerNode[] = [makeNode("root", "folder")];
  const edges: FewerEdge[] = [];
  for (let i = 0; i < 3; i++) {
    nodes.push(makeNode(`dir${i}`, "folder"));
    edges.push(makeEdge("root", `dir${i}`));
    for (let j = 0; j < 4; j++) {
      nodes.push(makeNode(`dir${i}-f${j}`, "file", (i + 1) * 100 + j));
      edges.push(makeEdge(`dir${i}`, `dir${i}-f${j}`));
    }
  }
  return { nodes, edges };
}

const park = () =>
  useGraphStore.setState({
    nodes: useGraphStore.getState().nodes.map((n) => ({ ...n, position: { x: PARKED, y: PARKED } })),
  });

/** True when a layout pass moved at least one card off the sentinel. */
function aPassRan(): boolean {
  return useGraphStore.getState().nodes.some((n) => n.position.x !== PARKED);
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
    autoRelayout: true,
    tags: [],
    past: [],
    future: [],
  });
});

describe("autoRelayout gate", () => {
  it("defaults to on: showing a hidden card re-flows the tree", () => {
    useGraphStore.setState({ hiddenIds: ["dir1-f0"] });
    park();
    useGraphStore.getState().showNode("dir1-f0");
    expect(aPassRan()).toBe(true);
  });

  it("defaults to on: revealSubtree re-flows the tree", () => {
    useGraphStore.setState({ hiddenIds: ["dir1-f0", "dir1-f1", "dir1-f2"] });
    park();
    useGraphStore.getState().revealSubtree("dir1");
    expect(aPassRan()).toBe(true);
  });

  it("off: showing cards changes what is visible but not the arrangement", () => {
    useGraphStore.setState({ hiddenIds: ["dir1-f0"], autoRelayout: false });
    park();
    useGraphStore.getState().showNode("dir1-f0");
    expect(useGraphStore.getState().hiddenIds).not.toContain("dir1-f0");
    expect(aPassRan()).toBe(false);
  });

  it("off: revealSubtree stays quiet too", () => {
    useGraphStore.setState({ hiddenIds: ["dir1-f0", "dir1-f1"], autoRelayout: false });
    park();
    useGraphStore.getState().revealSubtree("dir1");
    expect(aPassRan()).toBe(false);
  });

  it("off: Show All does not re-flow either", () => {
    useGraphStore.setState({ hiddenIds: ["dir1-f0", "dir2-f1"], autoRelayout: false });
    park();
    useGraphStore.getState().showAll();
    expect(aPassRan()).toBe(false);
  });

  it("off: Organize still re-flows — it is an explicit request", () => {
    useGraphStore.getState().setAutoRelayout(false);
    park();
    useGraphStore.getState().organizeAll();
    expect(aPassRan()).toBe(true);
  });

  it("off: Sort still re-flows — it is an explicit request", () => {
    useGraphStore.getState().setAutoRelayout(false);
    park();
    useGraphStore.getState().setSortKey("size");
    expect(aPassRan()).toBe(true);
  });
});

describe("autoRelayout persistence", () => {
  it("survives a settings apply (local + cloud sync both land here)", () => {
    applyUserSettings({ autoRelayout: false } as never);
    expect(useGraphStore.getState().autoRelayout).toBe(false);

    // A settings blob written before the field existed leaves the current value.
    useGraphStore.getState().setAutoRelayout(true);
    applyUserSettings({} as never);
    expect(useGraphStore.getState().autoRelayout).toBe(true);
  });
});
