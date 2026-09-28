import { test, expect } from "bun:test";
import { computeStats } from "./stats";
import type { FewerNode } from "./types";

function makeNode(id: string, data: Partial<FewerNode["data"]>): FewerNode {
  return { id, position: { x: 0, y: 0 }, data: { label: id, path: id, type: "file", ...data } } as FewerNode;
}

test("computeStats counts symlink nodes separately from files/folders", () => {
  const stats = computeStats(
    [
      makeNode("root", { type: "folder" }),
      makeNode("v012", { type: "folder" }),
      makeNode("latest", { type: "folder", symlink: { target: "v012", insideTree: true } }),
      makeNode("readme.md", { type: "file", size: 5 }),
      makeNode("alias.md", { type: "file", size: 5, symlink: { target: "readme.md", insideTree: true } }),
    ],
    [],
  );
  expect(stats.totalFolders).toBe(3); // links to dirs count as folders
  expect(stats.totalFiles).toBe(2);  // links to files count as files
  expect(stats.totalSymlinks).toBe(2);
});