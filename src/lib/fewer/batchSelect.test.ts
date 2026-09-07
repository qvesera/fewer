import { describe, expect, it } from "bun:test";
import {
  selectDescendants,
  selectSameExtension,
  selectSameCategory,
} from "./batchSelect";
import type { FewerEdge } from "./types";

const edges: FewerEdge[] = [
  { id: "e1", source: "root", target: "a", type: "smoothstep" },
  { id: "e2", source: "root", target: "b", type: "smoothstep" },
  { id: "e3", source: "a", target: "a1", type: "smoothstep" },
  { id: "e4", source: "a", target: "a2", type: "smoothstep" },
  { id: "e5", source: "a1", target: "a1x", type: "smoothstep" },
];

const nodes = [
  { id: "root", data: { label: "root", type: "folder", path: "/root", category: "data" } },
  { id: "a", data: { label: "a", type: "folder", path: "/a", extension: "ts", category: "code" } },
  { id: "b", data: { label: "b", type: "file", path: "/b", extension: "ts", category: "code" } },
  { id: "a1", data: { label: "a1", type: "file", path: "/a/a1", extension: "tsx", category: "code" } },
  { id: "a2", data: { label: "a2", type: "file", path: "/a/a2", extension: "md", category: "doc" } },
  { id: "a1x", data: { label: "a1x", type: "file", path: "/a/a1/a1x", extension: "json", category: "data" } },
] as unknown as Parameters<typeof selectSameCategory>[0];

describe("selectDescendants", () => {
  it("returns selection plus all descendants, deduped", () => {
    expect(selectDescendants(["a"], edges).sort()).toEqual(["a", "a1", "a1x", "a2"]);
  });
  it("is a no-op for a leaf", () => {
    expect(selectDescendants(["b"], edges)).toEqual(["b"]);
  });
  it("unions multiple roots", () => {
    expect(selectDescendants(["root", "a2"], edges).sort()).toEqual([
      "a", "a1", "a1x", "a2", "b", "root",
    ]);
  });
});

describe("selectSameExtension", () => {
  it("selects all nodes sharing the selection's extensions", () => {
    // selecting a (.ts) and a1 (.tsx) => all .ts and .tsx nodes
    expect(selectSameExtension(nodes, ["a", "a1"]).sort()).toEqual(["a", "a1", "b"]);
  });
  it("returns selection unchanged when nothing has an extension", () => {
    expect(selectSameExtension(nodes, ["root"])).toEqual(["root"]);
  });
});

describe("selectSameCategory", () => {
  it("selects all nodes sharing the selection's categories", () => {
    // a1 is "code" => all code nodes (a, b, a1)
    expect(selectSameCategory(nodes, ["a1"]).sort()).toEqual(["a", "a1", "b"]);
  });
  it("returns selection unchanged when nothing has a category", () => {
    const bare = [
      { id: "x", data: { label: "x", type: "file", path: "/x" } },
    ] as unknown as Parameters<typeof selectSameCategory>[0];
    expect(selectSameCategory(bare, ["x"])).toEqual(["x"]);
  });
});
