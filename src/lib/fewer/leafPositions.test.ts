import { describe, expect, test, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import {
  resolveViewNodes,
  resolveViewSettings,
  type ResolvedViewSettings,
  type ViewSettings,
} from "./viewState";
import type { FewerNode, FewerEdge } from "./types";

/**
 * Regression cover for the per-view position precedence.
 *
 * A view's `positions` map only ever holds the cards the user dragged in that
 * view. `resolveViewNodes` used to check "does this view have a map?" rather
 * than "does this view have a position for THIS card?", so a card created after
 * the map was seeded (handle drag, add-node dialog, a new child in a dock pane)
 * had no entry and silently fell through to the shared store position — a
 * coordinate from the *global* layout, sitting among siblings that a view with
 * its own direction/collapse/hide had placed with the contour engine. That is
 * the wrong-slot-in-the-secondary-pane report, and the same early return is why
 * Sort and Organize looked inert on a per-view canvas.
 *
 * The fix inverts the order: derive the view's own layout when the view derives
 * one, then let explicit per-view positions override it card by card.
 */

const FW = 240, FH = 200, CW = 220, CH = 58;

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

const GLOBAL: ResolvedViewSettings = {
  showFiles: true,
  minimapHidden: false,
  edgeStyle: "curved",
  edgeAnimated: false,
  edgeAnimatedSelectedOnly: false,
  edgeStrokeStyle: "solid",
  edgeWidth: 2,
  direction: "TB",
  hiddenIds: [],
  collapsedFolderIds: [],
};

function fileIds(nodes: FewerNode[]): string[] {
  return nodes.filter((n) => n.data.type === "file").map((n) => n.id);
}

/** The layout options the canvas hands resolveViewNodes. */
function layoutOptions() {
  const s = useGraphStore.getState();
  return { shynessScale: s.shynessScale, sortKey: s.sortKey, sortDir: s.sortDir };
}

/** The global triple the resolver and Organize both take. */
function globals() {
  const s = useGraphStore.getState();
  return { direction: s.direction, hiddenIds: s.hiddenIds as string[], fileIds: fileIds(s.nodes) };
}

/** Resolve a leaf exactly as the canvas does, from current store state. */
function resolve(leafId: string): FewerNode[] {
  const s = useGraphStore.getState();
  return resolveViewNodes(
    s.nodes,
    s.edges,
    s.viewSettings[leafId],
    resolveViewSettings(s.viewSettings, leafId, GLOBAL),
    globals(),
    layoutOptions(),
  );
}

/** Resolve with the view's positions removed — same view settings otherwise,
 *  so the comparison isolates the positions map and nothing else. */
function resolveDerived(leafId: string): FewerNode[] {
  const s = useGraphStore.getState();
  const raw = s.viewSettings[leafId];
  const resolved = resolveViewSettings(s.viewSettings, leafId, GLOBAL);
  return resolveViewNodes(
    s.nodes,
    s.edges,
    raw ? { ...raw, positions: undefined } : raw,
    { ...resolved, positions: undefined },
    globals(),
    layoutOptions(),
  );
}

const posOf = (nodes: FewerNode[], id: string) => nodes.find((n) => n.id === id)!.position;

beforeEach(() => {
  useGraphStore.setState({
    nodes: [],
    edges: [],
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
    past: [],
    future: [],
  });
});

describe("per-view positions over a derived layout", () => {
  test("a card the view has no position for lands where the view's own layout puts it", () => {
    // root → dir0, painted in a view that overrides direction (so the view
    // derives its own layout) and already holds a dragged position for root.
    useGraphStore.setState({
      nodes: [makeNode("root", "folder"), makeNode("dir0", "folder")],
      edges: [makeEdge("root", "dir0")],
      viewSettings: { leafA: { direction: "LR", positions: { root: { x: 777, y: 888 } } } },
    });

    // dir0 is not in the map: it must still take the LR contour slot, not its
    // store position (which the shared TB layout produced).
    expect(posOf(resolve("leafA"), "dir0")).toEqual(posOf(resolveDerived("leafA"), "dir0"));
  });

  test("an explicit per-view position still overrides the derived slot", () => {
    useGraphStore.setState({
      nodes: [makeNode("root", "folder"), makeNode("dir0", "folder")],
      edges: [makeEdge("root", "dir0")],
      viewSettings: {
        leafA: {
          direction: "LR",
          positions: { root: { x: 777, y: 888 }, dir0: { x: 42, y: 43 } },
        },
      },
    });

    expect(posOf(resolve("leafA"), "root")).toEqual({ x: 777, y: 888 });
    expect(posOf(resolve("leafA"), "dir0")).toEqual({ x: 42, y: 43 });
  });

  test("a view that does not derive keeps the shared position for an unmapped card", () => {
    // No direction/collapse/hide divergence: the shared layout already is the
    // view's layout, and resolveViewNodes must not pay for a second layout pass.
    const nodes = [makeNode("root", "folder"), makeNode("dir0", "folder")];
    useGraphStore.setState({
      nodes,
      edges: [makeEdge("root", "dir0")],
      viewSettings: { leafA: { positions: { root: { x: 5, y: 5 } } } },
    });

    const out = resolve("leafA");
    expect(posOf(out, "root")).toEqual({ x: 5, y: 5 });
    // Identity is preserved for every card the map does not override.
    expect(out.find((n) => n.id === "dir0")).toBe(
      useGraphStore.getState().nodes.find((n) => n.id === "dir0"),
    );
  });
});

describe("card created after a view was seeded", () => {
  test("a new child shows up in the view's layout slot, not the shared one", () => {
    useGraphStore.setState({
      nodes: [makeNode("root", "folder")],
      edges: [],
      viewSettings: { leafA: { direction: "LR", positions: { root: { x: 0, y: 0 } } } },
    });
    const id = useGraphStore.getState().addNode("root", "added", "file", { x: 5000, y: 5000 });

    // The new card has no entry in leafA's map (the map is only written on
    // drag), and the shared store put it wherever addNode dropped it.
    expect(posOf(resolve("leafA"), id)).toEqual(posOf(resolveDerived("leafA"), id));
  });
});

describe("sort on a per-view canvas", () => {
  test("Sort by Size re-derives a view that holds manual positions", () => {
    // Names and sizes disagree on order: name = a,b,c / size asc = b,c,a.
    useGraphStore.setState({
      nodes: [
        makeNode("root", "folder"),
        makeNode("a", "file", 1000),
        makeNode("b", "file", 10),
        makeNode("c", "file", 100),
      ],
      edges: [makeEdge("root", "a"), makeEdge("root", "b"), makeEdge("root", "c")],
      sortKey: "name",
      viewSettings: { leafA: { direction: "TB", positions: { root: { x: 0, y: 0 } } } },
    });

    // Siblings of a TB tree share a y and are spread along x.
    const siblingOrder = (leafId: string) =>
      resolve(leafId)
        .filter((n) => n.data.type === "file")
        .sort((p, q) => p.position.x - q.position.x || p.position.y - q.position.y)
        .map((n) => n.id);

    expect(siblingOrder("leafA")).toEqual(["a", "b", "c"]);

    useGraphStore.getState().setSortKey("size");
    expect(siblingOrder("leafA")).toEqual(["b", "c", "a"]);
  });
});

describe("organizeAll", () => {
  test("re-flows every view that holds manual positions, not just the active one", () => {
    useGraphStore.setState({
      nodes: [makeNode("root", "folder"), makeNode("dir0", "folder")],
      edges: [makeEdge("root", "dir0")],
      activeLeafId: "leafA",
      viewSettings: {
        leafA: { positions: { root: { x: 10, y: 10 } } },
        leafB: { direction: "LR", positions: { root: { x: 20, y: 20 } } },
      },
    });

    (useGraphStore.getState() as unknown as { organizeAll: () => void }).organizeAll();

    const s = useGraphStore.getState();
    expect(s.viewSettings.leafA?.positions).toBeUndefined();
    expect(s.viewSettings.leafB?.positions).toBeUndefined();
    // The shared layout was re-flowed, so the leafB canvas re-derives LR from it.
    expect(posOf(resolve("leafB"), "root")).toEqual(posOf(resolveDerived("leafB"), "root"));
  });
});

