import { test, expect } from "bun:test";
import { getDescendants } from "./validation";
import { countDescendants } from "./keyboardShortcuts";
import type { FewerEdge } from "./types";

// ─── getDescendants ───────────────────────────────────────────────
//
// The edge list is a DAG, so a node can have several parents. Every test below
// pins the "exactly once, never the root" contract that callers count on.

test("getDescendants returns [] for a leaf root", () => {
  const edges: FewerEdge[] = [
    { id: "e1", source: "a", target: "b" },
  ] as FewerEdge[];
  expect(getDescendants("b", edges)).toEqual([]);
});

test("getDescendants returns [] when there are no edges", () => {
  expect(getDescendants("a", [])).toEqual([]);
});

test("getDescendants lists each node once on a diamond DAG", () => {
  // a → b, a → c, b → d, c → d: `d` is reachable by two paths.
  const edges: FewerEdge[] = [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "a", target: "c" },
    { id: "e3", source: "b", target: "d" },
    { id: "e4", source: "c", target: "d" },
  ] as FewerEdge[];
  const out = getDescendants("a", edges);
  expect(out).toEqual(["b", "c", "d"]);
  // The length is user-visible (CustomNode's "N cards hidden" toast), so assert
  // uniqueness directly too rather than relying on the ordering above.
  expect(out.length).toBe(new Set(out).size);
});

test("getDescendants collapses a three-parent fan-in to one entry", () => {
  const edges: FewerEdge[] = [
    { id: "e1", source: "root", target: "p1" },
    { id: "e2", source: "root", target: "p2" },
    { id: "e3", source: "root", target: "p3" },
    { id: "e4", source: "p1", target: "shared" },
    { id: "e5", source: "p2", target: "shared" },
    { id: "e6", source: "p3", target: "shared" },
  ] as FewerEdge[];
  expect(getDescendants("root", edges)).toEqual(["p1", "p2", "p3", "shared"]);
});

test("getDescendants never includes the root, even when a cycle returns to it", () => {
  const edges: FewerEdge[] = [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "b", target: "a" },
  ] as FewerEdge[];
  expect(getDescendants("a", edges)).toEqual(["b"]);
});

test("getDescendants excludes a self-loop's own root", () => {
  const edges: FewerEdge[] = [
    { id: "e1", source: "a", target: "a" },
  ] as FewerEdge[];
  expect(getDescendants("a", edges)).toEqual([]);
});

test("getDescendants keeps breadth-first order across two levels", () => {
  const edges: FewerEdge[] = [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "a", target: "c" },
    { id: "e3", source: "b", target: "d" },
    { id: "e4", source: "c", target: "e" },
  ] as FewerEdge[];
  expect(getDescendants("a", edges)).toEqual(["b", "c", "d", "e"]);
});

test("getDescendants length agrees with countDescendants on a diamond", () => {
  // The two helpers walk the same edges and must agree; drift here is what made
  // the "Hide Children" toast disagree with the batch-action toast.
  const edges: FewerEdge[] = [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "a", target: "c" },
    { id: "e3", source: "b", target: "d" },
    { id: "e4", source: "c", target: "d" },
  ] as FewerEdge[];
  expect(getDescendants("a", edges).length).toBe(countDescendants(["a"], edges));
});
