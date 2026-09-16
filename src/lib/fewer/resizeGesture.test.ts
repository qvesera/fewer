import { test, expect } from "bun:test";
import { applyOps, undoOps } from "./history";
import { beginResizeGesture, endResizeGesture, isResizeGestureFor, nodeDims, pendingResizeOps } from "./resizeGesture";
import type { FewerNode, ResizeOp } from "./types";

/** File card: no `style.height` on purpose (only folders pin a height). */
function fileNode(measuredH: number, styleW = 180): FewerNode {
  return {
    id: "f1",
    type: "file",
    position: { x: 0, y: 0 },
    data: { label: "readme.md", path: "readme.md", type: "file" },
    style: { width: styleW },
    measured: { width: styleW, height: measuredH },
  } as FewerNode;
}

/** Folder card: `style.height` is the pinned/card height the user picked. */
function folderNode(w: number, h: number): FewerNode {
  return {
    id: "d1",
    type: "folder",
    position: { x: 0, y: 0 },
    data: { label: "src", path: "src", type: "folder" },
    style: { width: w, height: h },
    measured: { width: w, height: h },
  } as FewerNode;
}

test("a re-measure outside a resize gesture is never captured", () => {
  // What a rename looks like: React Flow re-measures the card, no handle drag.
  expect(isResizeGestureFor("f1")).toBe(false);
  beginResizeGesture("f1");
  expect(isResizeGestureFor("f1")).toBe(true);
  expect(isResizeGestureFor("other")).toBe(false);
  endResizeGesture();
  expect(isResizeGestureFor("f1")).toBe(false);
});

test("a file card is never recorded as resize-to-height-0", () => {
  // Label wrapped onto another line → measured height 56 → 74, style untouched.
  const ops = pendingResizeOps([fileNode(74)], new Map([["f1", nodeDims(fileNode(56))]]));
  expect(ops).toHaveLength(1);
  expect(ops[0].to).toEqual({ w: 180, h: 74 });
  expect(ops[0].to.h).not.toBe(0);
});

test("undo then redo of a recorded resize leaves the card renderable", () => {
  const op: ResizeOp = { type: "resize", changes: pendingResizeOps([fileNode(74)], new Map([["f1", nodeDims(fileNode(56))]])) };
  const applied = applyOps([fileNode(74)], [], [op]);
  const undone = undoOps(applied.nodes, applied.edges, [op]);
  const redone = applyOps(undone.nodes, undone.edges, [op]);
  expect(undone.nodes[0].style?.height).toBe(56);
  // height 0 here is the bug: the card stays in the graph but paints 0px tall.
  expect(redone.nodes[0].style?.height).not.toBe(0);
  expect(redone.nodes[0].style?.height).toBe(74);
});

test("unchanged dims and empty captures produce no op", () => {
  const n = fileNode(56);
  expect(pendingResizeOps([n], new Map([["f1", nodeDims(n)]]))).toEqual([]);
  expect(pendingResizeOps([n], new Map())).toEqual([]);
});

test("a real folder resize is still recorded and round-trips", () => {
  const op: ResizeOp = { type: "resize", changes: pendingResizeOps([folderNode(320, 180)], new Map([["d1", nodeDims(folderNode(200, 120))]])) };
  expect(op.changes).toEqual([{ nodeId: "d1", from: { w: 200, h: 120 }, to: { w: 320, h: 180 } }]);
  const applied = applyOps([folderNode(200, 120)], [], [op]);
  expect(applied.nodes[0].style).toMatchObject({ width: 320, height: 180 });
  const undone = undoOps(applied.nodes, applied.edges, [op]);
  expect(undone.nodes[0].style).toMatchObject({ width: 200, height: 120 });
});