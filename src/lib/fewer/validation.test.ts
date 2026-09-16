import { test, expect } from "bun:test";
import { ancestorChainOf, childrenMapOf, getDescendants, isAncestor, parentMapOf } from "./validation";
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

// ─── parentMapOf ──────────────────────────────────────────────────
//
// The ancestor counterpart of childrenMapOf: every upward walk in the store
// slices, layout and Hidden panel used to build this map inline.

test("parentMapOf maps each child to its parent", () => {
  const edges: FewerEdge[] = [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "b", target: "c" },
  ] as FewerEdge[];
  expect(parentMapOf(edges).get("b")).toBe("a");
  expect(parentMapOf(edges).get("c")).toBe("b");
});

test("parentMapOf is empty for no edges", () => {
  expect(parentMapOf([]).size).toBe(0);
});

test("parentMapOf records no entry for a root", () => {
  const edges: FewerEdge[] = [
    { id: "e1", source: "a", target: "b" },
  ] as FewerEdge[];
  expect(parentMapOf(edges).has("a")).toBe(false);
});

test("parentMapOf is the inverse of childrenMapOf", () => {
  const edges: FewerEdge[] = [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "a", target: "c" },
    { id: "e3", source: "b", target: "d" },
  ] as FewerEdge[];
  const children = childrenMapOf(edges);
  const parents = parentMapOf(edges);
  for (const [parent, kids] of children) {
    for (const kid of kids) expect(parents.get(kid)).toBe(parent);
  }
});

test("parentMapOf last edge wins on a fan-in, matching the documented contract", () => {
  // Unreachable through the connect UI (it enforces a single parent), but
  // `setGraph` stores imported edges verbatim, so the tie-break must be pinned.
  const edges: FewerEdge[] = [
    { id: "e1", source: "p1", target: "child" },
    { id: "e2", source: "p2", target: "child" },
  ] as FewerEdge[];
  expect(parentMapOf(edges).get("child")).toBe("p2");
});

// ─── ancestorChainOf ──────────────────────────────────────────────
//
// The upward counterpart of getDescendants. Both must terminate on an imported
// cycle; the inline walks this replaced followed parentMap with no visited set.

test("ancestorChainOf lists ancestors from parent to root", () => {
  const edges: FewerEdge[] = [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "b", target: "c" },
  ] as FewerEdge[];
  expect(ancestorChainOf("c", parentMapOf(edges))).toEqual(["b", "a"]);
});

test("ancestorChainOf is empty for a root and for no edges", () => {
  const edges: FewerEdge[] = [
    { id: "e1", source: "a", target: "b" },
  ] as FewerEdge[];
  expect(ancestorChainOf("a", parentMapOf(edges))).toEqual([]);
  expect(ancestorChainOf("b", parentMapOf([]))).toEqual([]);
});

test("ancestorChainOf terminates on a two-node cycle", () => {
  const edges: FewerEdge[] = [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "b", target: "a" },
  ] as FewerEdge[];
  // a → b and b → a: from `a` the chain is just `b`, then `a` repeats and stops.
  expect(ancestorChainOf("a", parentMapOf(edges))).toEqual(["b"]);
});

test("ancestorChainOf terminates on a self-loop", () => {
  const edges: FewerEdge[] = [
    { id: "e1", source: "a", target: "a" },
  ] as FewerEdge[];
  expect(ancestorChainOf("a", parentMapOf(edges))).toEqual([]);
});

test("ancestorChainOf stops at the first repeat on a cycle not through the root", () => {
  const edges: FewerEdge[] = [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "b", target: "c" },
    { id: "e3", source: "c", target: "d" },
    { id: "e4", source: "d", target: "c" },
  ] as FewerEdge[];
  // `a` is untouched by the c↔d cycle.
  expect(ancestorChainOf("a", parentMapOf(edges))).toEqual([]);
  // From `d`: only `c`, because `d` is on the cycle itself — each id is
  // emitted at most once and the start is never included.
  expect(ancestorChainOf("d", parentMapOf(edges))).toEqual(["c"]);
});

// ─── isAncestor ───────────────────────────────────────────────────

test("isAncestor finds an ancestor reached through any parent of a fan-in node", () => {
  // Regression guard: `c` has two parents, and parentMapOf keeps only one (last
  // edge wins). Walking a single chain would miss `a` and silently weaken the
  // cycle check in validateConnection on an imported multi-parent graph.
  const edges: FewerEdge[] = [
    { id: "e1", source: "a", target: "c" },
    { id: "e2", source: "b", target: "c" },
  ] as FewerEdge[];
  expect(isAncestor("a", "c", edges)).toBe(true);
  expect(isAncestor("b", "c", edges)).toBe(true);
  expect(isAncestor("z", "c", edges)).toBe(false);
});

test("isAncestor is false for a node that is not in the chain", () => {
  const edges: FewerEdge[] = [
    { id: "e1", source: "a", target: "b" },
  ] as FewerEdge[];
  expect(isAncestor("a", "b", edges)).toBe(true);
  expect(isAncestor("b", "a", edges)).toBe(false);
  expect(isAncestor("a", "a", edges)).toBe(false);
});

test("isAncestor keeps its previous reachability on a cycle", () => {
  const edges: FewerEdge[] = [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "b", target: "a" },
  ] as FewerEdge[];
  // Pre-existing behaviour, deliberately preserved: on a cycle a node is
  // reachable from itself, so both directions report true. Unreachable from the
  // UI — validateConnection rejects self-parenting before it calls this.
  expect(isAncestor("a", "a", edges)).toBe(true);
  expect(isAncestor("a", "b", edges)).toBe(true);
});
