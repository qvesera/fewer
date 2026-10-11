/**
 * Group frame regressions (T-132): two menu actions shipped broken and neither
 * shows up in the pure model/store suites, so they are pinned here:
 *
 *  1. "Select Members" wrote `selectedNodeIds` with a raw setState. The canvas
 *     paints `selected` from a stamp invalidated by `selectionVersion`, so the
 *     ids changed and nothing lit up — now it goes through setSelectedNodeIds,
 *     which bumps that stamp and mirrors into the active leaf.
 *  2. "Color…" opened a Radix Popover with no trigger and no anchor, so Popper
 *     had nothing to position from and the picker never showed.
 *
 * Renders GroupFrame directly: GroupFrames mounts it inside a ViewportPortal,
 * which needs a whole <ReactFlow> tree a unit test has no reason to build.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReactFlowProvider } from "@xyflow/react";
import { GroupFrame } from "@/components/fewer/GroupFrames";
import { useGraphStore } from "@/store/graphStore";
import type { Group } from "@/lib/fewer/groups";
import { GROUP_PADDING, COLLAPSED_PILL_WIDTH } from "@/lib/fewer/groups";
import type { FewerNode } from "@/lib/fewer/types";

const NODES = [
  { id: "n1", type: "file", position: { x: 0, y: 0 }, style: { width: 140, height: 60 },
    data: { label: "alpha", path: "alpha", type: "file" } },
  { id: "n2", type: "file", position: { x: 300, y: 0 }, style: { width: 140, height: 60 },
    data: { label: "beta", path: "beta", type: "file" } },
] as FewerNode[];

const GROUP: Group = { id: "g-1", title: "Assets", note: "", memberIds: ["n1", "n2"] };

function renderFrame(
  props: {
    visible?: ReadonlySet<string>;
    group?: Group;
    nodes?: FewerNode[];
    leafId?: string;
  } = {},
) {
  return render(
    <ReactFlowProvider>
      <TooltipProvider>
        <GroupFrame
          group={props.group ?? GROUP}
          nodes={props.nodes ?? NODES}
          visible={props.visible ?? new Set(["n1", "n2"])}
          leafId={props.leafId}
        />
      </TooltipProvider>
    </ReactFlowProvider>,
  );
}

/** The header carries the title and is the ContextMenuTrigger. */
function openMenu() {
  fireEvent.contextMenu(screen.getByText("Assets").parentElement!);
}

/** The draggable strip; also the click-to-select target. */
function header() {
  return document.querySelector("[data-group-header]")!;
}

beforeEach(() => {
  useGraphStore.setState({
    // App-like baseline: the collapsed pill anchors on the store's FULL node
    // list (hidden members aren't in the painted prop), so every describe needs
    // the store populated, not just the nodes prop (T-138).
    nodes: NODES.map((n) => ({ ...n })),
    groups: [],
    viewSettings: {},
    selectedNodeIds: [],
    selectedGroupIds: [],
    selectionVersion: 0,
    leafSelections: {},
    activeLeafId: null,
    past: [],
    future: [],
  });
});
afterEach(cleanup);

describe("GroupFrame visibility (T-134)", () => {
  test("a group whose members are all hidden renders nothing", () => {
    const { container } = renderFrame({ visible: new Set<string>() });
    expect(container.querySelector("[data-group-id]")).toBeNull();
    expect(screen.queryByText("Assets")).toBeNull();
  });

  test("a collapsed group still renders its pill when its members are hidden", () => {
    // Collapse is what hides them — visible-only bounds would delete the pill's
    // own handle and make collapsing undo-only.
    const { container } = renderFrame({
      visible: new Set<string>(),
      group: { ...GROUP, collapsed: true },
    });
    expect(container.querySelector("[data-group-id]")).toBeTruthy();
    expect(screen.getByText("Assets")).toBeTruthy();
  });

  test("the count reads visible/total when some members are hidden", () => {
    renderFrame({ visible: new Set(["n1"]) });
    expect(screen.getByText("1 of 2 members")).toBeTruthy();
  });

  test("the count reads plain total when nothing is hidden", () => {
    renderFrame();
    expect(screen.getByText("2 members")).toBeTruthy();
  });
});

describe("GroupFrame select + move (T-135)", () => {
  beforeEach(() => {
    // The gesture writes the REAL store, so seed it with the same cards.
    useGraphStore.setState({
      nodes: NODES.map((n) => ({ ...n })),
      groups: [{ ...GROUP, memberIds: [...GROUP.memberIds] }],
    });
  });

  const headerEl = () => document.querySelector("[data-group-header]")!;
  const memberPos = (id: string) => {
    const n = useGraphStore.getState().nodes.find((x) => x.id === id)!;
    return { x: n.position.x, y: n.position.y };
  };
  const press = (x: number, y: number, extra: Record<string, unknown> = {}) =>
    fireEvent.pointerDown(headerEl(), { pointerId: 1, button: 0, clientX: x, clientY: y, ...extra });
  const dragTo = (x: number, y: number) =>
    fireEvent.pointerMove(headerEl(), { pointerId: 1, clientX: x, clientY: y });
  const release = () => fireEvent.pointerUp(headerEl(), { pointerId: 1 });

  test("clicking the header selects the group and clears the card selection", () => {
    useGraphStore.getState().setSelectedNodeIds(["n1", "n2"]);
    renderFrame();
    press(0, 0);
    release();
    const s = useGraphStore.getState();
    expect(s.selectedGroupIds).toEqual(["g-1"]);
    expect(s.selectedNodeIds).toEqual([]);
    expect(document.querySelector("[data-group-id]")?.getAttribute("data-selected")).toBe("true");
  });

  test("selecting a card clears the group selection (mutual exclusion, both ways)", () => {
    renderFrame();
    press(0, 0);
    release();
    expect(useGraphStore.getState().selectedGroupIds).toEqual(["g-1"]);
    useGraphStore.getState().setSelectedNodeIds(["n1"]);
    expect(useGraphStore.getState().selectedGroupIds).toEqual([]);
  });

  test("shift+clicking a selected group toggles it off", () => {
    renderFrame();
    press(0, 0);
    release();
    expect(useGraphStore.getState().selectedGroupIds).toEqual(["g-1"]);
    press(0, 0, { shiftKey: true });
    release();
    expect(useGraphStore.getState().selectedGroupIds).toEqual([]);
  });

  test("dragging the header moves every member and records ONE undo step", () => {
    renderFrame();
    press(100, 100);
    dragTo(150, 130);
    expect(memberPos("n1")).toEqual({ x: 50, y: 30 });
    expect(memberPos("n2")).toEqual({ x: 350, y: 30 });
    // Mid-gesture: nothing recorded yet — the drag is not its own history spam.
    expect(useGraphStore.getState().past).toHaveLength(0);
    release();
    const s = useGraphStore.getState();
    expect(s.past).toHaveLength(1);
    expect(JSON.stringify(s.past[0])).toContain("move-positions");
  });

  test("a hidden member moves with the group", () => {
    renderFrame({ visible: new Set(["n1"]) });
    press(100, 100);
    dragTo(130, 100);
    release();
    expect(memberPos("n2")).toEqual({ x: 330, y: 0 });
  });

  test("Ctrl+Z after a drag restores the original positions", () => {
    renderFrame();
    press(100, 100);
    dragTo(150, 130);
    release();
    useGraphStore.getState().undo();
    expect(memberPos("n1")).toEqual({ x: 0, y: 0 });
    expect(memberPos("n2")).toEqual({ x: 300, y: 0 });
  });

  test("Escape mid-drag restores positions and records nothing", () => {
    renderFrame();
    press(100, 100);
    dragTo(150, 130);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(memberPos("n1")).toEqual({ x: 0, y: 0 });
    release();
    expect(useGraphStore.getState().past).toHaveLength(0);
    // The selection survives the cancelled drag.
    expect(useGraphStore.getState().selectedGroupIds).toEqual(["g-1"]);
  });

  test("Escape with no drag clears the group selection", () => {
    renderFrame();
    press(0, 0);
    release();
    expect(useGraphStore.getState().selectedGroupIds).toEqual(["g-1"]);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useGraphStore.getState().selectedGroupIds).toEqual([]);
  });

  test("Delete ungroups every selected group", () => {
    renderFrame();
    press(0, 0);
    release();
    fireEvent.keyDown(window, { key: "Delete" });
    expect(useGraphStore.getState().groups).toHaveLength(0);
    expect(useGraphStore.getState().selectedGroupIds).toEqual([]);
  });
});

describe("GroupFrame resize-scale (T-136)", () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: NODES.map((n) => ({ ...n })),
      groups: [{ ...GROUP, memberIds: [...GROUP.memberIds] }],
    });
  });

  const headerEl = () => document.querySelector("[data-group-header]")!;
  const handleEl = (id: string) => document.querySelector(`[data-group-handle="${id}"]`)!;
  const memberPos = (id: string) => {
    const n = useGraphStore.getState().nodes.find((x) => x.id === id)!;
    return { x: n.position.x, y: n.position.y };
  };
  const select = () => {
    fireEvent.pointerDown(headerEl(), { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(headerEl(), { pointerId: 1 });
  };
  const dragHandle = (id: string, from: { x: number; y: number }, to: { x: number; y: number }, extra: Record<string, unknown> = {}) => {
    fireEvent.pointerDown(handleEl(id), { pointerId: 2, button: 0, clientX: from.x, clientY: from.y });
    fireEvent.pointerMove(handleEl(id), { pointerId: 2, clientX: to.x, clientY: to.y, ...extra });
    fireEvent.pointerUp(handleEl(id), { pointerId: 2 });
  };

  test("handles render only on a selected, expanded frame", () => {
    renderFrame();
    expect(document.querySelector("[data-group-handle]")).toBeNull();
    select();
    expect(document.querySelectorAll("[data-group-handle]").length).toBe(8);
  });

  test("a collapsed selected frame renders no handles (the pill has no layout to scale)", () => {
    renderFrame({ group: { ...GROUP, collapsed: true } });
    select();
    expect(document.querySelector("[data-group-handle]")).toBeNull();
  });

  test("dragging the se handle doubles the arrangement around the top-left origin", () => {
    renderFrame();
    select();
    // Frame box: members at (0,0) and (300,0) with padding/header → box corner
    // (-24,-56), size 488×172. se anchors on that corner; doubling the
    // pointer's distance from it doubles every offset.
    dragHandle("se", { x: 464, y: 116 }, { x: 952, y: 288 });
    expect(memberPos("n1").x).toBeCloseTo(24, 0);
    expect(memberPos("n1").y).toBeCloseTo(56, 0);
    expect(memberPos("n2").x).toBeCloseTo(624, 0);
    expect(memberPos("n2").y).toBeCloseTo(56, 0);
  });

  test("an edge handle scales one axis only", () => {
    renderFrame();
    select();
    // e anchors on the left edge (x=-24, y=center 30); doubling x leaves y put.
    dragHandle("e", { x: 464, y: 30 }, { x: 952, y: 30 });
    expect(memberPos("n2").x).toBeCloseTo(624, 0);
    expect(memberPos("n1").y).toBe(0);
    expect(memberPos("n2").y).toBe(0);
  });

  test("Shift locks an edge handle to uniform scaling", () => {
    renderFrame();
    select();
    // e-handle doubles x; with Shift the y factor follows — around the edge's
    // midpoint (y=14: box spans −56…84), so the row widens and spreads.
    dragHandle("e", { x: 464, y: 30 }, { x: 952, y: 30 }, { shiftKey: true });
    expect(memberPos("n2").x).toBeCloseTo(624, 0);
    expect(memberPos("n1").y).toBeCloseTo(-14, 0);
    expect(memberPos("n2").y).toBeCloseTo(-14, 0);
  });

  test("the scale clamps so the frame never drops below GROUP_MIN_BOX", () => {
    renderFrame();
    select();
    // Shatter toward the origin: sx would be ~0, clamped to 168/488.
    dragHandle("se", { x: 464, y: 116 }, { x: -20, y: -50 });
    const gap = memberPos("n2").x - memberPos("n1").x;
    expect(gap).toBeCloseTo(300 * (168 / 488), 0);
  });

  test("a scale records ONE undo step and Ctrl+Z restores the arrangement", () => {
    renderFrame();
    select();
    dragHandle("se", { x: 464, y: 116 }, { x: 952, y: 288 });
    const s = useGraphStore.getState();
    expect(s.past).toHaveLength(1);
    expect(JSON.stringify(s.past[0])).toContain("move-positions");
    s.undo();
    expect(memberPos("n1")).toEqual({ x: 0, y: 0 });
    expect(memberPos("n2")).toEqual({ x: 300, y: 0 });
  });

  test("Escape mid-scale restores positions and records nothing", () => {
    renderFrame();
    select();
    fireEvent.pointerDown(handleEl("se"), { pointerId: 2, button: 0, clientX: 464, clientY: 116 });
    fireEvent.pointerMove(handleEl("se"), { pointerId: 2, clientX: 952, clientY: 288 });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(memberPos("n1")).toEqual({ x: 0, y: 0 });
    fireEvent.pointerUp(handleEl("se"), { pointerId: 2 });
    expect(useGraphStore.getState().past).toHaveLength(0);
    // The selection survives the cancelled gesture.
    expect(useGraphStore.getState().selectedGroupIds).toEqual(["g-1"]);
  });
});

describe("GroupFrame per-view positions (T-137)", () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: NODES.map((n) => ({ ...n })),
      groups: [{ ...GROUP, memberIds: [...GROUP.memberIds] }],
      viewSettings: {},
    });
  });

  const headerEl = () => document.querySelector("[data-group-header]")!;
  const memberPos = (id: string) => {
    const n = useGraphStore.getState().nodes.find((x) => x.id === id)!;
    return { x: n.position.x, y: n.position.y };
  };
  const viewPos = (leaf: string, id: string) =>
    useGraphStore.getState().viewSettings[leaf]?.positions?.[id];

  test("the frame measures the painted nodes it is handed, not the shared coords", () => {
    // The canvas paints cards 500px right of their shared coords (derived
    // layout / per-view map) — the box must follow the painted array it is
    // given, or it detaches from the cluster (T-138).
    const painted = NODES.map((n) => ({
      ...n,
      position: n.id === "n1" ? { x: 500, y: 0 } : { x: 800, y: 0 },
    }));
    renderFrame({ nodes: painted });
    const box = document.querySelector("[data-group-id]") as HTMLElement;
    expect(box.style.left).toBe(`${500 - GROUP_PADDING}px`);
  });

  test("in a leaf canvas the drag writes the per-view map, leaving shared positions alone", () => {
    // Mirror the real canvas: a pointer landing in it activates the leaf first.
    useGraphStore.setState({
      activeLeafId: "leaf-1",
      viewSettings: { "leaf-1": { positions: { n1: { x: 0, y: 0 }, n2: { x: 300, y: 0 } } } },
    });
    renderFrame({ leafId: "leaf-1" });
    fireEvent.pointerDown(headerEl(), { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(headerEl(), { pointerId: 1, clientX: 150, clientY: 130 });
    fireEvent.pointerUp(headerEl(), { pointerId: 1 });
    // The bug: writing shared coords while the cards paint from the map — the
    // frame slid away and the cards never moved. Now the map is the write.
    expect(memberPos("n1")).toEqual({ x: 0, y: 0 });
    expect(viewPos("leaf-1", "n1")).toEqual({ x: 50, y: 30 });
    expect(viewPos("leaf-1", "n2")).toEqual({ x: 350, y: 30 });
    // One undo entry, tagged with the leaf so undo restores the map.
    const s = useGraphStore.getState();
    expect(s.past).toHaveLength(1);
    expect(JSON.stringify(s.past[0])).toContain("leaf-1");
  });

  test("the first gesture in a leaf canvas seeds the map from painted positions", () => {
    // The canvas paints the cluster at 40/340 (its own layout); the shared
    // store still says 0/300. The seed must come from the painted array.
    const painted = NODES.map((n) => ({
      ...n,
      position: n.id === "n1" ? { x: 40, y: 0 } : { x: 340, y: 0 },
    }));
    renderFrame({ leafId: "leaf-1", nodes: painted });
    fireEvent.pointerDown(headerEl(), { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(headerEl(), { pointerId: 1, clientX: 10, clientY: 0 });
    fireEvent.pointerUp(headerEl(), { pointerId: 1 });
    // Seed starts from the PAINTED positions (40/340), not the shared (0/300),
    // so the cluster doesn't jump when the map takes over.
    expect(viewPos("leaf-1", "n1")).toEqual({ x: 50, y: 0 });
    expect(viewPos("leaf-1", "n2")).toEqual({ x: 350, y: 0 });
    expect(memberPos("n1")).toEqual({ x: 0, y: 0 });
  });

  test("Escape restores the per-view map in a leaf canvas", () => {
    useGraphStore.setState({
      viewSettings: { "leaf-1": { positions: { n1: { x: 0, y: 0 }, n2: { x: 300, y: 0 } } } },
    });
    renderFrame({ leafId: "leaf-1" });
    fireEvent.pointerDown(headerEl(), { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(headerEl(), { pointerId: 1, clientX: 50, clientY: 0 });
    expect(viewPos("leaf-1", "n1")).toEqual({ x: 50, y: 0 });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(viewPos("leaf-1", "n1")).toEqual({ x: 0, y: 0 });
    fireEvent.pointerUp(headerEl(), { pointerId: 1 });
    expect(useGraphStore.getState().past).toHaveLength(0);
  });

  test("the header buttons keep their click (capture is deferred past the threshold)", () => {
    renderFrame();
    // A press on the header selects the group but must not break the buttons
    // inside it — pointerdown-era capture retargeted the click away from them
    // and killed collapse/note/× in every real browser (T-137).
    fireEvent.pointerDown(headerEl(), { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(headerEl(), { pointerId: 1 });
    fireEvent.click(screen.getByLabelText("Collapse group"));
    expect(useGraphStore.getState().groups[0]?.collapsed).toBe(true);
  });
});

describe("GroupFrame membership legibility (T-141)", () => {
  const NODES3 = [
    ...NODES,
    { id: "n3", type: "file", position: { x: 100, y: 10 }, style: { width: 100, height: 30 },
      data: { label: "stranger", path: "stranger", type: "file" } },
  ] as FewerNode[];

  beforeEach(() => {
    useGraphStore.setState({
      nodes: NODES3.map((n) => ({ ...n })),
      groups: [{ ...GROUP, memberIds: [...GROUP.memberIds] }],
      viewSettings: {},
    });
  });

  const headerEl = () => document.querySelector("[data-group-header]")!;
  const memberRings = () => document.querySelectorAll("[data-group-member-ring]");

  test("selecting the frame rings its member cards — and only them", () => {
    // The box cannot promise to enclose its members (explicit membership), so
    // selection states ownership directly by ringing exactly the members.
    renderFrame({ nodes: NODES3, visible: new Set(["n1", "n2", "n3"]) });
    expect(memberRings()).toHaveLength(0);
    fireEvent.pointerDown(headerEl(), { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(headerEl(), { pointerId: 1 });
    const ids = [...memberRings()].map((el) => el.getAttribute("data-group-member-ring")).sort();
    expect(ids).toEqual(["n1", "n2"]); // the stranger inside gets no ring
  });

  test("the menu offers to include the non-member sitting fully inside", () => {
    renderFrame({ nodes: NODES3, visible: new Set(["n1", "n2", "n3"]) });
    fireEvent.contextMenu(screen.getByText("Assets").parentElement!);
    fireEvent.click(screen.getByText("Include 1 card inside"));
    // Membership adopts the stranger in ONE groups op — one undo step.
    const s = useGraphStore.getState();
    expect(s.groups[0]?.memberIds).toEqual(["n1", "n2", "n3"]);
    expect(s.past).toHaveLength(1);
    expect(JSON.stringify(s.past[0])).toContain("groups");
  });

  test("no Include item when nothing extra is inside", () => {
    renderFrame();
    fireEvent.contextMenu(screen.getByText("Assets").parentElement!);
    expect(screen.queryByText(/^Include /)).toBeNull();
  });
});

describe("GroupFrame pill styling (T-139)", () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: NODES.map((n) => ({ ...n })),
      groups: [{ ...GROUP, memberIds: [...GROUP.memberIds] }],
      viewSettings: {},
    });
  });

  test("the collapsed pill carries the card shell, not the old toolbar strip", () => {
    renderFrame({ group: { ...GROUP, collapsed: true } });
    const shell = document.querySelector("[data-pill-shell]") as HTMLElement;
    // Same design language as a collapsed folder card: rounded-xl shell,
    // backdrop blur, node shadow, group theme tokens — plus an icon tile.
    expect(shell.className).toContain("rounded-xl");
    expect(shell.className).toContain("backdrop-blur-xl");
    expect(shell.className).toContain("shadow-node-folder");
    expect(shell.className).toContain("bg-fewer-group-bg");
    expect(shell.className).toContain("border-fewer-group-border");
    expect(document.querySelector('[data-group-header] svg.lucide-boxes')).toBeTruthy();
  });

  test("the pill reads \"2 members\", never \"0 of 2 members\"", () => {
    // Every member is hidden BY the collapse — "0 of 2 members" read as a bug.
    renderFrame({ group: { ...GROUP, collapsed: true }, visible: new Set<string>() });
    expect(screen.getByText("2 members")).toBeTruthy();
    expect(screen.queryByText(/0 of/)).toBeNull();
  });

  test("an expanded frame keeps the strip header and honest visible/total count", () => {
    renderFrame();
    expect(document.querySelector("[data-pill-shell]")).toBeNull();
    expect(screen.getByText("2 members")).toBeTruthy();
  });
});

describe("GroupFrame menu actions", () => {
  test("Select Members selects the cards and invalidates the selection stamp", async () => {
    renderFrame();
    openMenu();

    fireEvent.click(await screen.findByText("Select Members"));

    const s = useGraphStore.getState();
    expect(s.selectedNodeIds).toEqual(["n1", "n2"]);
    // The actual regression: without this bump the canvas lens never re-stamps
    // the `selected` flags and the cards render as unselected.
    expect(s.selectionVersion).toBeGreaterThan(0);
  });

  test("Color… opens the picker (hex field present, nothing before)", async () => {
    renderFrame();
    expect(screen.queryByLabelText("Group color hex value")).toBeNull();

    openMenu();
    fireEvent.click(await screen.findByText("Color…"));

    // The popover is portalled into document.body.
    expect(await screen.findByLabelText("Group color hex value")).toBeTruthy();
    expect(screen.getByText("Reset to default")).toBeTruthy();
  });
});

describe("Collapsed pill sizing + rename ring (T-142)", () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: NODES.map((n) => ({ ...n })),
      groups: [{ ...GROUP, memberIds: [...GROUP.memberIds] }],
      viewSettings: {},
    });
  });

  test("the pill's width is content-driven with the constant only as a floor", () => {
    // The static 240px cut long names off (T-142). The root sizes to its
    // in-flow header (max-content); the header carries the floor as min-width.
    const { container } = renderFrame({ group: { ...GROUP, collapsed: true } });
    const pill = container.querySelector("[data-group-id]") as HTMLElement;
    expect(pill.style.width).toBe("max-content");
    expect((document.querySelector("[data-group-header]") as HTMLElement).style.minWidth).toBe(
      `${COLLAPSED_PILL_WIDTH}px`,
    );
  });

  test("a long name renders in full — no truncate on the collapsed title", () => {
    const title = "Brand-system-2026-and-beyond final archive";
    renderFrame({ group: { ...GROUP, title, collapsed: true } });
    const span = screen.getByText(title);
    expect(span.className).not.toContain("truncate");
    expect(span.className).toContain("whitespace-nowrap");
  });

  test("the rename input drops its ring while the frame is selected", () => {
    // The click that opens the editor also selects the frame, so an input ring
    // stacked on the selection ring — the reported double ring (T-142).
    useGraphStore.setState({ selectedGroupIds: ["g-1"] });
    renderFrame({ group: { ...GROUP, collapsed: true } });
    fireEvent.doubleClick(screen.getByText("Assets"));
    expect(screen.getByLabelText("Group title").className).not.toContain("ring-1");
  });

  test("the rename input keeps its ring when the frame is NOT selected", () => {
    renderFrame({ group: { ...GROUP, collapsed: true } });
    fireEvent.doubleClick(screen.getByText("Assets"));
    expect(screen.getByLabelText("Group title").className).toContain("ring-1 ring-primary/60");
  });

  test("a mouse click on the title draws no focus ring (focus-visible only)", () => {
    // outline-none on the span; the class list must not carry a plain `ring-*`
    // or `outline` style that a click would trigger — only focus-visible:*.
    renderFrame({ group: { ...GROUP, collapsed: true } });
    const span = screen.getByText("Assets");
    expect(span.className).toContain("focus-visible:ring-1");
    expect(span.className.split(" ").filter((c) => /^ring-|^outline-[0-9]/.test(c))).toEqual([]);
  });
});
