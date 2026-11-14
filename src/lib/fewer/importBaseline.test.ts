import { test, expect, describe } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import { captureBaseline, rootLabelOf, stripRoot } from "./importBaseline";
import type { FewerNode } from "./types";

function node(
  id: string,
  path: string,
  type: "file" | "folder" = "file",
  extra: Record<string, unknown> = {},
): FewerNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { label: path.split("/").pop() ?? path, path, type, ...extra },
  } as unknown as FewerNode;
}

describe("captureBaseline", () => {
  test("captures the tree as it was imported", () => {
    const nodes = [
      node("root", "project", "folder", { isRoot: true }),
      node("f1", "project/src", "folder"),
      node("f2", "project/src/main.rs"),
    ];
    expect(captureBaseline(nodes)).toEqual([
      { id: "root", path: "project", type: "folder", isRoot: true },
      { id: "f1", path: "project/src", type: "folder" },
      { id: "f2", path: "project/src/main.rs", type: "file" },
    ]);
  });

  test("skips cards that are not files or folders", () => {
    const nodes = [
      node("root", "project", "folder", { isRoot: true }),
      { id: "pill", type: "groupPill", position: { x: 0, y: 0 }, data: { label: "Assets" } } as unknown as FewerNode,
    ];
    expect(captureBaseline(nodes).map((entry) => entry.id)).toEqual(["root"]);
  });

  test("keeps the symlink target", () => {
    const nodes = [
      node("root", "project", "folder", { isRoot: true }),
      node("l1", "project/link", "file", { symlink: { target: "../elsewhere" } }),
    ];
    expect(captureBaseline(nodes)[1].symlink).toBe("../elsewhere");
  });
});

describe("rootLabelOf", () => {
  test("finds the imported root folder", () => {
    const nodes = [
      node("root", "project", "folder", { isRoot: true }),
      node("f1", "project/src", "folder"),
    ];
    expect(rootLabelOf(nodes)).toBe("project");
  });

  test("falls back to the shallowest path when no root is flagged", () => {
    const nodes = [node("a", "project/src", "folder"), node("b", "project", "folder")];
    expect(rootLabelOf(nodes)).toBe("project");
  });
});

describe("stripRoot", () => {
  test("makes a path relative to the root folder", () => {
    expect(stripRoot("project/src/main.rs", "project")).toBe("src/main.rs");
    expect(stripRoot("project", "project")).toBe("");
  });

  test("leaves a path that is not under the root alone", () => {
    expect(stripRoot("elsewhere/file.txt", "project")).toBe("elsewhere/file.txt");
  });
});

describe("the store keeps the baseline", () => {
  test("a fresh load captures the tree as the baseline", () => {
    useGraphStore.setState({ nodes: [], edges: [], baseline: null });
    const nodes = [
      node("root", "project", "folder", { isRoot: true }),
      node("f1", "project/src", "folder"),
    ];
    useGraphStore.getState().setGraph(nodes, [], false);
    expect(useGraphStore.getState().baseline).toEqual([
      { id: "root", path: "project", type: "folder", isRoot: true },
      { id: "f1", path: "project/src", type: "folder" },
    ]);
  });

  test("a merge keeps the baseline it had", () => {
    useGraphStore.setState({ nodes: [], edges: [], baseline: null });
    useGraphStore.getState().setGraph([node("root", "project", "folder", { isRoot: true })], [], false);
    const before = useGraphStore.getState().baseline;
    useGraphStore.getState().setGraph([node("root", "project", "folder", { isRoot: true })], [], true);
    expect(useGraphStore.getState().baseline).toEqual(before);
  });
});
