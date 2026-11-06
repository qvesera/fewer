import { describe, beforeEach, expect, test } from "bun:test";
import {
  childRowsOf,
  childCountOf,
  nodeByIdOf,
  resetCardChildSlots,
} from "./cardChildRows";
import type { FewerNode, FewerEdge } from "./types";

function folder(id: string, label: string): FewerNode {
  return { id, type: "folder", position: { x: 0, y: 0 }, style: { width: 240, height: 200 }, data: { label, path: `/${label}`, type: "folder" } } as FewerNode;
}
function file(id: string, label: string): FewerNode {
  return { id, type: "file", position: { x: 200, y: 0 }, style: { width: 220, height: 58 }, data: { label, path: `/${label}`, type: "file", category: "text" } } as FewerNode;
}
function edge(source: string, target: string): FewerEdge {
  return { id: `${source}->${target}`, source, target } as FewerEdge;
}

beforeEach(() => resetCardChildSlots());

describe("childRowsOf", () => {
  test("same children under fresh array identities keep the SAME rows reference", () => {
    // A store write swaps the arrays but leaves untouched node refs alone —
    // that is the case the slot exists for.
    const nodes = [folder("root", "root"), file("a", "a.md")];
    const edges = [edge("root", "a")];
    const first = childRowsOf("root", nodes, edges);
    const second = childRowsOf("root", [...nodes], [...edges]);
    expect(second).toBe(first);
  });

  test("a write that touched another subtree keeps this card's rows reference", () => {
    const nodes = [folder("root", "root"), folder("other", "other"), file("a", "a.md"), file("b", "b.md")];
    const edges = [edge("root", "a"), edge("other", "b")];
    const first = childRowsOf("root", nodes, edges);
    // Unrelated churn: new arrays, same content for "root".
    const nodes2 = [...nodes, file("x", "x.md")];
    const edges2 = [...edges, edge("other", "x")];
    expect(childRowsOf("root", nodes2, edges2)).toBe(first);
    // …and "other" DOES change, so only its slot moves.
    const other = childRowsOf("other", nodes2, edges2);
    expect(other.map((n) => n.id)).toEqual(["b", "x"]);
    expect(other).not.toBe(childRowsOf("other", nodes, edges));
  });

  test("own child change mints a new rows array", () => {
    const before = childRowsOf("root", [folder("root", "root")], []);
    const after = childRowsOf("root", [folder("root", "root"), file("a", "a.md")], [edge("root", "a")]);
    expect(after).not.toBe(before);
    expect(after.map((n) => n.id)).toEqual(["a"]);
  });
});

describe("childCountOf", () => {
  test("counts edges, including dangling ones, and is a plain number", () => {
    const edges = [edge("root", "a"), edge("root", "ghost")];
    expect(childCountOf("root", edges)).toBe(2);
    expect(childCountOf("root", [])).toBe(0);
    expect(childCountOf("root", edges)).toBe(childCountOf("root", [...edges])); // value-stable
  });
});

describe("nodeByIdOf", () => {
  test("matches nodes.find but through graphIndex's cached map", () => {
    const nodes = [folder("root", "root"), file("a", "a.md")];
    expect(nodeByIdOf(nodes, "a")).toBe(nodes[1]);
    expect(nodeByIdOf(nodes, "missing")).toBeUndefined();
    // Same array identity → same cached index.
    expect(nodeByIdOf(nodes, "a")).toBe(nodeByIdOf(nodes, "a"));
  });
});

describe("resetCardChildSlots", () => {
  test("a whole-graph swap drops slots so the old graph's rows are not pinned", () => {
    const oldNodes = [folder("root", "root"), file("a", "a.md")];
    const oldEdges = [edge("root", "a")];
    const pinned = childRowsOf("root", oldNodes, oldEdges);
    expect(childRowsOf("root", [...oldNodes], [...oldEdges])).toBe(pinned); // slot alive

    resetCardChildSlots();

    const fresh = childRowsOf("root", [...oldNodes], [...oldEdges]);
    expect(fresh).not.toBe(pinned); // no slot → recomputed, old ref unreachable
  });
});
