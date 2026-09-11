import { describe, expect, it, beforeEach, afterEach } from "bun:test";
// Import the real store module directly: importActionUrl.test.ts registers a
// bun mock.module on "@/store/graphStore" (a getState-only stub) and bun's
// mock registry leaks across test files in the same process, which would
// replace this binding with the stub. createStore.ts is the underlying
// singleton re-exported by graphStore.ts and is not mocked anywhere.
import { useGraphStore } from "@/store/createStore";
import { defaultDirection } from "@/store/slices/layoutSlice";
import { edgeDashPattern } from "./types";
import type { FewerNode, FewerEdge } from "./types";

function makeNode(id: string, type: "folder" | "file" = "folder"): FewerNode {
  return {
    id,
    type: "folder",
    position: { x: 0, y: 0 },
    data: { label: id, path: `/${id}`, type, parentId: null },
    style: { width: 240, height: 200 },
  } as FewerNode;
}

function makeEdge(source: string, target: string, type: FewerEdge["type"] = "smoothstep"): FewerEdge {
  return { id: `e-${source}-${target}`, source, target, type } as FewerEdge;
}

function seedSmall() {
  // Reset the full layout surface, not just the graph: sibling test files in
  // the shared bun process mutate store state (edgeStyle, edgeWidth, ...), and
  // this file asserts documented defaults, so seed them explicitly.
  useGraphStore.setState({
    nodes: [makeNode("root", "folder"), makeNode("child", "file")],
    edges: [makeEdge("root", "child")],
    selectedNodeIds: [],
    direction: "TB",
    edgeStyle: "angled",
    edgeAnimated: false,
    edgeAnimatedSelectedOnly: false,
    edgeStrokeStyle: "solid",
    edgeAnimatedStrokeStyle: "dashed",
    edgeWidth: 2,
    cornerRadius: 8,
    nodeWidth: 240,
    nodeHeight: 200,
    shynessScale: 1,
    sortKey: "name",
    sortDir: "asc",
  });
}

let relayoutCount = 0;
let originalRelayout: (() => void) | undefined;

beforeEach(() => {
  seedSmall();
  relayoutCount = 0;
  originalRelayout = useGraphStore.getState().relayout;
  useGraphStore.setState({ relayout: () => { relayoutCount++; } });
});

afterEach(() => {
  if (originalRelayout) useGraphStore.setState({ relayout: originalRelayout });
});

const s = () => useGraphStore.getState();

describe("layoutSlice defaults", () => {
  it("initializes with isomorphic TB default and documented layout values", () => {
    expect(s().direction).toBe("TB");
    expect(s().edgeStyle).toBe("angled");
    expect(s().edgeAnimated).toBe(false);
    expect(s().edgeAnimatedSelectedOnly).toBe(false);
    expect(s().edgeStrokeStyle).toBe("solid");
    expect(s().edgeAnimatedStrokeStyle).toBe("dashed");
    expect(s().edgeWidth).toBe(2);
    expect(s().cornerRadius).toBe(8);
    expect(s().nodeWidth).toBe(240);
    expect(s().nodeHeight).toBe(200);
    expect(s().shynessScale).toBe(1);
    expect(s().sortKey).toBe("name");
    expect(s().sortDir).toBe("asc");
  });
});

describe("defaultDirection (responsive, SSR-safe)", () => {
  /** Assign globalThis.window for the duration of fn, then restore the
   * previous value. Plain property save/assign/restore (no descriptor
   * spread) so we never create non-writable globals that leak into sibling
   * test files running in the same bun process. */
  function withWindow(value: unknown, fn: () => void) {
    const g = globalThis as { window?: unknown };
    const prev = g.window;
    g.window = value;
    try {
      fn();
    } finally {
      g.window = prev;
    }
  }

  const screenOf = (width: number, height: number) => ({ screen: { width, height } });

  it("returns TB when window is undefined (SSR / headless)", () => {
    withWindow(undefined, () => {
      expect(defaultDirection()).toBe("TB");
    });
  });

  it("returns LR on a sub-full-HD screen (1920x1080)", () => {
    withWindow(screenOf(1920, 1080), () => {
      expect(defaultDirection()).toBe("LR");
    });
  });

  it("returns TB on an exactly-1.5k screen (2560x1440)", () => {
    withWindow(screenOf(2560, 1440), () => {
      expect(defaultDirection()).toBe("TB");
    });
  });

  it("returns TB on a 4k screen (3840x2160)", () => {
    withWindow(screenOf(3840, 2160), () => {
      expect(defaultDirection()).toBe("TB");
    });
  });

  it("returns LR on a short wide screen (3200x1080)", () => {
    withWindow(screenOf(3200, 1080), () => {
      expect(defaultDirection()).toBe("LR");
    });
  });

  it("returns LR on a tall narrow screen (1080x1920)", () => {
    withWindow(screenOf(1080, 1920), () => {
      expect(defaultDirection()).toBe("LR");
    });
  });

  it("returns TB when both screen dimensions are zero", () => {
    withWindow(screenOf(0, 0), () => {
      expect(defaultDirection()).toBe("TB");
    });
  });

  it("returns TB when only width is zero", () => {
    withWindow(screenOf(0, 1080), () => {
      expect(defaultDirection()).toBe("TB");
    });
  });
});

describe("setDirection", () => {
  it("sets the direction field", () => {
    s().setDirection("LR");
    expect(s().direction).toBe("LR");
    s().setDirection("BT");
    expect(s().direction).toBe("BT");
  });

  it("regenerates every edge id (deterministic counter, unique within a call)", () => {
    const before = s().edges.map((e) => e.id);
    s().setDirection("LR");
    const after = s().edges.map((e) => e.id);
    before.forEach((old, i) => {
      expect(after[i]).not.toBe(old);
      expect(after[i]).toMatch(/^e-[^-]+-[^-]+-[0-9]+$/);
    });
    // No two edges may share an id after a direction switch (parallel edges
    // included) — the counter guarantees it.
    expect(new Set(after).size).toBe(after.length);
  });

  it("keeps regenerating ids across repeated direction switches", () => {
    s().setDirection("LR");
    const first = s().edges.map((e) => e.id);
    s().setDirection("TB");
    const second = s().edges.map((e) => e.id);
    second.forEach((id, i) => {
      expect(id).not.toBe(first[i]);
      expect(id).toMatch(/^e-[^-]+-[^-]+-[0-9]+$/);
    });
  });

  it("maps edge type from the current edgeStyle via the type map", () => {
    s().setDirection("LR");
    expect(s().edges[0].type).toBe("smoothstep");
    s().setEdgeStyle("curved");
    s().setDirection("TB");
    expect(s().edges[0].type).toBe("default");
    s().setEdgeStyle("straight");
    s().setDirection("LR");
    expect(s().edges[0].type).toBe("straight");
  });

  it("does not bump graphVersion (relayout is manual)", () => {
    const before = s().graphVersion;
    s().setDirection("LR");
    expect(s().graphVersion).toBe(before);
    expect(relayoutCount).toBe(0);
  });

  it("preserves source/target across regen", () => {
    s().setDirection("LR");
    expect(s().edges[0].source).toBe("root");
    expect(s().edges[0].target).toBe("child");
  });
});

describe("setEdgeStyle", () => {
  it("sets the edgeStyle field and maps edge type", () => {
    s().setEdgeStyle("curved");
    expect(s().edgeStyle).toBe("curved");
    expect(s().edges[0].type).toBe("default");
    s().setEdgeStyle("angled");
    expect(s().edgeStyle).toBe("angled");
    expect(s().edges[0].type).toBe("smoothstep");
    s().setEdgeStyle("straight");
    expect(s().edgeStyle).toBe("straight");
    expect(s().edges[0].type).toBe("straight");
  });

  it("bumps graphVersion", () => {
    const before = s().graphVersion;
    s().setEdgeStyle("curved");
    expect(s().graphVersion).toBe(before + 1);
  });

  it("preserves edge id when style changes", () => {
    const before = s().edges[0].id;
    s().setEdgeStyle("curved");
    expect(s().edges[0].id).toBe(before);
  });
});

describe("setEdgeAnimated", () => {
  it("sets the edgeAnimated flag and writes dash on all edges from the base stroke style", () => {
    s().setEdgeAnimated(true);
    expect(s().edgeAnimated).toBe(true);
    expect(s().edges[0].animated).toBe(true);
    expect(s().edges[0].style?.strokeDasharray).toBeUndefined();

    s().setEdgeStrokeStyle("dashed");
    s().setEdgeAnimated(true);
    expect(s().edges[0].animated).toBe(true);
    expect(s().edges[0].style?.strokeDasharray).toBe(edgeDashPattern("dashed"));
  });

  it("keeps the base-style dash when animation is turned off", () => {
    s().setEdgeStrokeStyle("dashed");
    s().setEdgeAnimated(true);
    expect(s().edges[0].style?.strokeDasharray).toBe(edgeDashPattern("dashed"));
    s().setEdgeAnimated(false);
    expect(s().edges[0].animated).toBe(false);
    expect(s().edges[0].style?.strokeDasharray).toBe(edgeDashPattern("dashed"));
  });

  it("removes dash only when the base style is switched to solid", () => {
    s().setEdgeStrokeStyle("dashed");
    s().setEdgeAnimated(true);
    expect(s().edges[0].style?.strokeDasharray).toBe(edgeDashPattern("dashed"));
    s().setEdgeStrokeStyle("solid");
    expect(s().edges[0].animated).toBe(true);
    expect(s().edges[0].style?.strokeDasharray).toBeUndefined();
  });

  it("uses dotted base style dash when animated", () => {
    s().setEdgeStrokeStyle("dotted");
    s().setEdgeAnimated(true);
    expect(s().edges[0].style?.strokeDasharray).toBe(edgeDashPattern("dotted"));
  });

  it("bumps graphVersion", () => {
    const before = s().graphVersion;
    s().setEdgeAnimated(true);
    expect(s().graphVersion).toBe(before + 1);
  });
});

describe("setEdgeAnimatedSelectedOnly", () => {
  it("flips the flag only and bumps graphVersion", () => {
    expect(s().edgeAnimatedSelectedOnly).toBe(false);
    const before = s().graphVersion;
    s().setEdgeAnimatedSelectedOnly(true);
    expect(s().edgeAnimatedSelectedOnly).toBe(true);
    expect(s().graphVersion).toBe(before + 1);
    s().setEdgeAnimatedSelectedOnly(false);
    expect(s().edgeAnimatedSelectedOnly).toBe(false);
    expect(s().graphVersion).toBe(before + 2);
  });

  it("does not touch edge animated/dash fields", () => {
    s().setEdgeAnimatedSelectedOnly(true);
    expect(s().edges[0].animated).toBeUndefined();
    expect(s().edges[0].style).toBeUndefined();
  });
});

describe("setEdgeStrokeStyle", () => {
  it("sets the field and updates every edge strokeDasharray from the new style", () => {
    s().setEdgeStrokeStyle("dashed");
    expect(s().edgeStrokeStyle).toBe("dashed");
    expect(s().edges[0].style?.strokeDasharray).toBe(edgeDashPattern("dashed"));

    s().setEdgeStrokeStyle("dotted");
    expect(s().edgeStrokeStyle).toBe("dotted");
    expect(s().edges[0].style?.strokeDasharray).toBe(edgeDashPattern("dotted"));

    s().setEdgeStrokeStyle("solid");
    expect(s().edgeStrokeStyle).toBe("solid");
    expect(s().edges[0].style?.strokeDasharray).toBeUndefined();
  });

  it("bumps graphVersion", () => {
    const before = s().graphVersion;
    s().setEdgeStrokeStyle("dashed");
    expect(s().graphVersion).toBe(before + 1);
  });

  it("replaces previous dash; no stacking", () => {
    s().setEdgeStrokeStyle("dashed");
    expect(s().edges[0].style?.strokeDasharray).toBe(edgeDashPattern("dashed"));
    s().setEdgeStrokeStyle("dotted");
    expect(s().edges[0].style?.strokeDasharray).toBe(edgeDashPattern("dotted"));
  });
});

describe("setEdgeAnimatedStrokeStyle", () => {
  it("sets the field only and bumps graphVersion (no edge mutation here)", () => {
    const before = s().graphVersion;
    s().setEdgeAnimatedStrokeStyle("dotted");
    expect(s().edgeAnimatedStrokeStyle).toBe("dotted");
    expect(s().graphVersion).toBe(before + 1);
    expect(s().edges[0].style).toBeUndefined();
  });

  it("accepts dashed and solid values", () => {
    s().setEdgeAnimatedStrokeStyle("dashed");
    expect(s().edgeAnimatedStrokeStyle).toBe("dashed");
    s().setEdgeAnimatedStrokeStyle("solid");
    expect(s().edgeAnimatedStrokeStyle).toBe("solid");
  });
});

describe("setEdgeWidth", () => {
  it("sets edgeWidth and updates every edge strokeWidth", () => {
    s().setEdgeWidth(4);
    expect(s().edgeWidth).toBe(4);
    expect(s().edges[0].style?.strokeWidth).toBe(4);
  });

  it("clamps to [0.5, 6] and updates edge strokeWidth", () => {
    s().setEdgeWidth(4);
    expect(s().edgeWidth).toBe(4);
    expect(s().edges[0].style?.strokeWidth).toBe(4);
    s().setEdgeWidth(0.1);
    expect(s().edgeWidth).toBe(0.5);
    expect(s().edges[0].style?.strokeWidth).toBe(0.5);
    s().setEdgeWidth(10);
    expect(s().edgeWidth).toBe(6);
    expect(s().edges[0].style?.strokeWidth).toBe(6);
  });

  it("clamps exact boundary values", () => {
    s().setEdgeWidth(0.5);
    expect(s().edgeWidth).toBe(0.5);
    s().setEdgeWidth(6);
    expect(s().edgeWidth).toBe(6);
  });

  it("bumps graphVersion", () => {
    const before = s().graphVersion;
    s().setEdgeWidth(3);
    expect(s().graphVersion).toBe(before + 1);
  });
});

describe("setCornerRadius", () => {
  it("sets cornerRadius and updates every edge pathOptions.borderRadius", () => {
    s().setCornerRadius(12);
    expect(s().cornerRadius).toBe(12);
    expect(s().edges[0].pathOptions?.borderRadius).toBe(12);
  });

  it("clamps to [0, 20] and updates edge pathOptions", () => {
    s().setCornerRadius(12);
    expect(s().cornerRadius).toBe(12);
    expect(s().edges[0].pathOptions?.borderRadius).toBe(12);
    s().setCornerRadius(-5);
    expect(s().cornerRadius).toBe(0);
    expect(s().edges[0].pathOptions?.borderRadius).toBe(0);
    s().setCornerRadius(99);
    expect(s().cornerRadius).toBe(20);
    expect(s().edges[0].pathOptions?.borderRadius).toBe(20);
  });

  it("clamps exact boundary values", () => {
    s().setCornerRadius(0);
    expect(s().cornerRadius).toBe(0);
    s().setCornerRadius(20);
    expect(s().cornerRadius).toBe(20);
  });

  it("bumps graphVersion", () => {
    const before = s().graphVersion;
    s().setCornerRadius(5);
    expect(s().graphVersion).toBe(before + 1);
  });

  it("overwrites pathOptions each call (no merging with prior keys)", () => {
    s().setCornerRadius(8);
    expect(s().edges[0].pathOptions).toEqual({ borderRadius: 8 });
  });
});

describe("setNodeDimensions", () => {
  it("clamps width to min 120 and height to min 40", () => {
    s().setNodeDimensions(50, 10);
    expect(s().nodeWidth).toBe(120);
    expect(s().nodeHeight).toBe(40);
  });

  it("sets folder height but leaves file height undefined", () => {
    s().setNodeDimensions(300, 150);
    expect(s().nodeWidth).toBe(300);
    expect(s().nodeHeight).toBe(150);
    const root = s().nodes.find((n) => n.id === "root")!;
    const child = s().nodes.find((n) => n.id === "child")!;
    expect(root.style?.width).toBe(300);
    expect(root.style?.height).toBe(150);
    expect(child.style?.width).toBe(300);
    expect(child.style?.height).toBeUndefined();
  });

  it("sets minHeight undefined on all nodes", () => {
    s().setNodeDimensions(260, 180);
    expect(s().nodes.find((n) => n.id === "root")!.style?.minHeight).toBeUndefined();
  });

  it("clears measured on all nodes", () => {
    useGraphStore.setState({ nodes: s().nodes.map((n) => ({ ...n, measured: { width: 100, height: 100 } })) });
    s().setNodeDimensions(240, 200);
    expect(s().nodes.find((n) => n.id === "root")!.measured).toBeUndefined();
  });

  it("bumps graphVersion", () => {
    const before = s().graphVersion;
    s().setNodeDimensions(300, 200);
    expect(s().graphVersion).toBe(before + 1);
  });

  it("preserves node type, path, and parentId", () => {
    s().setNodeDimensions(300, 200);
    const root = s().nodes.find((n) => n.id === "root")!;
    const child = s().nodes.find((n) => n.id === "child")!;
    expect(root.data.type).toBe("folder");
    expect(root.data.path).toBe("/root");
    expect(root.data.parentId).toBeNull();
    expect(child.data.type).toBe("file");
    expect(child.data.path).toBe("/child");
  });
});

describe("setShynessScale", () => {
  it("sets the field and clamps to [0, 3]", () => {
    s().setShynessScale(2);
    expect(s().shynessScale).toBe(2);
    s().setShynessScale(-1);
    expect(s().shynessScale).toBe(0);
    s().setShynessScale(5);
    expect(s().shynessScale).toBe(3);
  });

  it("is a no-op when the clamped value equals the current value", () => {
    s().setShynessScale(1);
    const before = s().shynessScale;
    s().setShynessScale(1);
    expect(s().shynessScale).toBe(before);
  });

  it("does not trigger relayout", () => {
    s().setShynessScale(2);
    expect(relayoutCount).toBe(0);
  });

  it("does not bump graphVersion", () => {
    const before = s().graphVersion;
    s().setShynessScale(2);
    expect(s().graphVersion).toBe(before);
  });
});

describe("setSortKey", () => {
  it("sets the field and triggers relayout", () => {
    s().setSortKey("type");
    expect(s().sortKey).toBe("type");
    expect(relayoutCount).toBe(1);
  });

  it("is a no-op when the key is unchanged", () => {
    s().setSortKey("name");
    expect(relayoutCount).toBe(0);
    expect(s().sortKey).toBe("name");
  });

  it("does not trigger relayout when the key is unchanged (second call)", () => {
    s().setSortKey("type");
    const first = relayoutCount;
    s().setSortKey("type");
    expect(relayoutCount).toBe(first);
  });

  it("does not bump graphVersion (only sortKey + relayout)", () => {
    const before = s().graphVersion;
    s().setSortKey("type");
    expect(s().graphVersion).toBe(before);
  });
});

describe("setSortDir", () => {
  it("sets the field and triggers relayout", () => {
    s().setSortDir("desc");
    expect(s().sortDir).toBe("desc");
    expect(relayoutCount).toBe(1);
  });

  it("is a no-op when the direction is unchanged", () => {
    s().setSortDir("asc");
    expect(relayoutCount).toBe(0);
    expect(s().sortDir).toBe("asc");
  });

  it("does not trigger relayout when the direction is unchanged (second call)", () => {
    s().setSortDir("desc");
    const first = relayoutCount;
    s().setSortDir("desc");
    expect(relayoutCount).toBe(first);
  });

  it("does not bump graphVersion (only sortDir + relayout)", () => {
    const before = s().graphVersion;
    s().setSortDir("desc");
    expect(s().graphVersion).toBe(before);
  });
});
