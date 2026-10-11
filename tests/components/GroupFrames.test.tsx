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
import type { FewerNode } from "@/lib/fewer/types";

const NODES = [
  { id: "n1", type: "file", position: { x: 0, y: 0 }, style: { width: 140, height: 60 },
    data: { label: "alpha", path: "alpha", type: "file" } },
  { id: "n2", type: "file", position: { x: 300, y: 0 }, style: { width: 140, height: 60 },
    data: { label: "beta", path: "beta", type: "file" } },
] as FewerNode[];

const GROUP: Group = { id: "g-1", title: "Assets", note: "", memberIds: ["n1", "n2"] };

function renderFrame(props: { visible?: ReadonlySet<string>; group?: Group } = {}) {
  return render(
    <ReactFlowProvider>
      <TooltipProvider>
        <GroupFrame
          group={props.group ?? GROUP}
          nodes={NODES}
          visible={props.visible ?? new Set(["n1", "n2"])}
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
    expect(screen.getByText("1 of 2 cards")).toBeTruthy();
  });

  test("the count reads plain total when nothing is hidden", () => {
    renderFrame();
    expect(screen.getByText("2 cards")).toBeTruthy();
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
