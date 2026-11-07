import { describe, expect, test } from "bun:test";
import {
  buildMinimapGeometry,
  MAX_MINIMAP_RECTS,
  rectPath,
} from "./minimapPath";
import type { FewerNode } from "./types";

const folder = (id: string, x = 0, y = 0): FewerNode => ({
  id,
  type: "folder",
  position: { x, y },
  data: { label: id, path: id, type: "folder", depth: 1 },
  style: { width: 240, height: 200 },
} as FewerNode);

const file = (id: string, x = 0, y = 0): FewerNode => ({
  id,
  type: "file",
  position: { x, y },
  data: { label: id, path: id, type: "file", depth: 2 },
  style: { width: 220, height: 58 },
} as FewerNode);

describe("rectPath", () => {
  test("emits one closed subpath with rounded integers", () => {
    expect(rectPath(0, 0, 10, 5)).toBe("M0 0h10v5h-10v-5Z");
    expect(rectPath(1.4, 2.6, 3.5, 4.5)).toBe("M1 3h4v5h-4v-5Z");
  });
});

describe("buildMinimapGeometry", () => {
  test("empty input returns EMPTY geometry", () => {
    const geo = buildMinimapGeometry([]);
    expect(geo.drawn).toBe(0);
    expect(geo.folders).toBe("");
  });

  test("buckets folders and files into separate paths", () => {
    const geo = buildMinimapGeometry([folder("a"), file("b", 300, 0)]);
    const folders = geo.folders.match(/Z/g)?.length ?? 0;
    const files = geo.files.match(/Z/g)?.length ?? 0;
    expect(folders).toBe(1);
    expect(files).toBe(1);
    expect(geo.drawn).toBe(2);
    expect(geo.skipped).toBe(0);
  });

  test("bounds cover every node, not just drawn ones", () => {
    const geo = buildMinimapGeometry([folder("a", 0, 0), file("b", 1000, 500)]);
    expect(geo.bounds).toEqual({ minX: 0, minY: 0, maxX: 1220, maxY: 558 });
  });

  test("selected bucket wins over type, from the node's own flag", () => {
    const selected = { ...file("b", 300, 0), selected: true };
    const geo = buildMinimapGeometry([folder("a"), selected]);
    expect(geo.selected.match(/Z/g)?.length).toBe(1);
    expect(geo.files).toBe("");
    // explicit set overrides the flag (and vice versa: unselected ids leave flag unread)
    const geo2 = buildMinimapGeometry([folder("a"), selected], new Set<string>());
    expect(geo2.selected).toBe("");
  });

  test("stride thins files above maxRects but never folders or selected", () => {
    const nodes: FewerNode[] = [folder("f")];
    for (let i = 0; i < 9; i++) nodes.push(file(`n${i}`, i * 300, 0));
    nodes.push({ ...file("sel", 5000, 0), selected: true });
    const geo = buildMinimapGeometry(nodes, null, 5);
    // folders + selected always drawn
    expect(geo.folders.match(/Z/g)?.length).toBe(1);
    expect(geo.selected.match(/Z/g)?.length).toBe(1);
    // total drawn within budget + the always-set (ceil stride keeps it tight)
    expect(geo.drawn).toBeLessThanOrEqual(5 + 2);
    expect(geo.skipped).toBeGreaterThan(0);
  });

  test("hidden nodes are skipped entirely", () => {
    const hidden = { ...folder("a"), hidden: true };
    const geo = buildMinimapGeometry([hidden, file("b", 300, 0)]);
    expect(geo.drawn).toBe(1);
    expect(geo.folders).toBe("");
  });

  test("no spread: 120k nodes build without RangeError", () => {
    const many: FewerNode[] = [];
    for (let i = 0; i < 120_000; i++) many.push(file(`n${i}`, (i % 400) * 300, Math.floor(i / 400) * 70));
    const geo = buildMinimapGeometry(many);
    expect(geo.drawn).toBeGreaterThan(0);
    expect(geo.drawn).toBeLessThanOrEqual(MAX_MINIMAP_RECTS + 1);
  });
});
