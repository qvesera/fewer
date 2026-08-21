import { test, expect } from "bun:test";
import { collectShowSubtrees } from "@/store/slices/graphSlice";
import type { FewerEdge } from "./types";

function makeEdge(id: string, source: string, target: string): FewerEdge {
  return { id, source, target, type: "smoothstep" } as FewerEdge;
}

// root -> [a, b]; a -> [a1, a2]; a1 -> a1a  (source = parent, target = child)
const edges: FewerEdge[] = [
  makeEdge("e-root-a", "root", "a"),
  makeEdge("e-root-b", "root", "b"),
  makeEdge("e-a-a1", "a", "a1"),
  makeEdge("e-a-a2", "a", "a2"),
  makeEdge("e-a1-a1a", "a1", "a1a"),
];

test("collectShowSubtrees reveals hidden ids and their hidden descendants", () => {
  const hidden = ["a", "a1", "a2", "a1a", "b"];
  const toShow = collectShowSubtrees(edges, hidden, [], ["a", "b"]);
  expect([...toShow].sort()).toEqual(["a", "a1", "a2", "a1a", "b"].sort());
});

test("collectShowSubtrees skips independently hidden descendants and their subtrees", () => {
  const hidden = ["a", "a1", "a1a", "a2"];
  const toShow = collectShowSubtrees(edges, hidden, ["a1"], ["a"]);
  // a1 was hidden directly by the user, so a1 (and its child a1a) stay hidden.
  expect([...toShow].sort()).toEqual(["a", "a2"].sort());
});

test("collectShowSubtrees ignores ids that are not hidden", () => {
  expect([...collectShowSubtrees(edges, ["b"], [], ["a", "root"])]).toEqual([]);
  expect([...collectShowSubtrees(edges, [], [], ["a"])]).toEqual([]);
});

test("collectShowSubtrees does not walk past visible descendants", () => {
  // a1 is visible, so its hidden child a1a must NOT be revealed by showing a.
  const toShow = collectShowSubtrees(edges, ["a", "a1a"], [], ["a"]);
  expect([...toShow].sort()).toEqual(["a"].sort());
});
