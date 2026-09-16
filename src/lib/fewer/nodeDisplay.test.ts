import { describe, expect, test } from "bun:test";
import { getHandlePositions, formatSize, providerLabelFromSource, renameSelection, nodeChildren } from "./nodeDisplay";
import type { FewerNode, FewerEdge } from "./types";

describe("node display decisions", () => {
  test.each([
    ["TB", "bottom", "top"], ["BT", "top", "bottom"],
    ["LR", "right", "left"], ["RL", "left", "right"],
    [undefined, "bottom", "top"], ["unknown", "bottom", "top"],
  ])("handles for %s", (direction, source, target) => {
    expect(String(getHandlePositions(direction).source)).toBe(source);
    expect(String(getHandlePositions(direction).target)).toBe(target);
  });
  test.each([[0, ""], [1, "1 B"], [1023, "1023 B"], [1024, "1.0 KB"], [1536, "1.5 KB"], [1048576, "1.0 MB"]] as const)("formats %s bytes", (bytes, text) => {
    expect(formatSize(bytes)).toBe(text);
  });
  test.each([
    [null, "Provider"], ["local", "Provider"], ["cloud:github:x", "GitHub"],
    ["cloud:google-drive:x", "Google Drive"], ["cloud:onedrive:x", "OneDrive"],
    ["cloud:sharepoint:x", "SharePoint"], ["cloud:azure-devops:x", "Azure DevOps"],
    ["cloud:azure-blob:x", "Azure Blob"], ["url:https://github.com/org/repo", "GitHub"],
    ["url:https://www.example.org/files", "example.org"], ["url:invalid", "Site"],
  ])("labels %s", (source, label) => expect(providerLabelFromSource(source)).toBe(label));
  test.each([["package.json", 7], ["archive.tar.gz", 11], [".gitignore", 10], ["README", 6], ["", 0]] as const)("rename selection for %s", (label, end) => {
    expect(renameSelection(label)).toEqual([0, end]);
  });
  test("child rows sort folders first without mutating nodes; counts retain duplicate/dangling edges", () => {
    const node = (id: string, type: "file" | "folder"): FewerNode => ({ id, type, position: { x: 0, y: 0 }, data: { label: id, path: id, type } });
    const nodes = [node("z", "file"), node("b", "folder"), node("a", "folder")];
    const edges: FewerEdge[] = ["z", "b", "a", "a", "missing"].map((target, i) => ({ id: String(i), source: "root", target }));
    const result = nodeChildren("root", true, nodes, edges, new Set(["a"]));
    expect(result.children.map((n) => n.id)).toEqual(["a", "b", "z"]);
    expect(result.childCount).toBe(5);
    expect(result.hiddenChildCount).toBe(3);
    expect(nodes.map((n) => n.id)).toEqual(["z", "b", "a"]);
    expect(result.children[0]).toBe(nodes[2]);
    expect(nodeChildren("root", false, nodes, edges, new Set())).toEqual({ children: [], childCount: 0, hiddenChildCount: 0 });
  });
});
