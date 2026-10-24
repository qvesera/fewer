import { describe, expect, test } from "bun:test";
import { deviceRelativePath, findDeviceNode } from "./deviceIndex";
import type { FewerNode } from "./types";

// The host-dependent seams (searchDevice, indexFolderQuiet) are covered by the
// Electron smoke test; the absolute-hit → graph-node mapping is pure and
// pinned here.

const node = (id: string, path: string): FewerNode =>
  ({ id, position: { x: 0, y: 0 }, data: { label: path, path, type: "file" } }) as unknown as FewerNode;

describe("deviceRelativePath", () => {
  test("strips the graph root prefix", () => {
    expect(deviceRelativePath({ path: "/home/u/app/src/main.ts" }, "/home/u/app")).toBe("src/main.ts");
  });

  test("windows separators normalize", () => {
    expect(deviceRelativePath({ path: "C:\\app\\src\\main.ts" }, "C:\\app")).toBe("src/main.ts");
  });

  test("outside the root or no root → null", () => {
    expect(deviceRelativePath({ path: "/other/main.ts" }, "/home/u/app")).toBeNull();
    expect(deviceRelativePath({ path: "/home/u/app/main.ts" }, null)).toBeNull();
  });
});

describe("findDeviceNode", () => {
  const nodes = [node("n1", "src/main.ts"), node("n2", "README.md")];

  test("resolves a hit under the loaded root", () => {
    expect(findDeviceNode(nodes, { path: "/root/src/main.ts" }, "/root")?.id).toBe("n1");
  });

  test("misses stay undefined (caller opens the folder instead)", () => {
    expect(findDeviceNode(nodes, { path: "/root/lib/other.ts" }, "/root")).toBeUndefined();
  });
});