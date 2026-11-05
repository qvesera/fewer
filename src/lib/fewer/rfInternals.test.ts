import { describe, expect, test } from "bun:test";
import { Position } from "@xyflow/react";
import { seedRfInternals, shouldSeedRfInternals } from "./rfInternals";
import type { FewerNode } from "./types";

const folder = (over: Partial<FewerNode> = {}): FewerNode => ({
  id: "f1",
  type: "folder",
  position: { x: 0, y: 0 },
  data: { label: "f", path: "f", type: "folder", depth: 1 },
  style: { width: 240, height: 200 },
  ...over,
} as FewerNode);

const opts = (direction: "TB" | "LR" = "TB", collapsedIds: string[] = []) => ({
  direction,
  collapsedIds: new Set(collapsedIds) as ReadonlySet<string>,
});

describe("seedRfInternals", () => {
  test("seeds an unmeasured folder with dimensions and two handles", () => {
    const [seeded] = seedRfInternals([folder()], opts());
    expect(seeded.measured).toEqual({ width: 240, height: 200 });
    expect(seeded.handles).toHaveLength(2);
    expect(seeded.handles!.map((h) => h.type).sort()).toEqual(["source", "target"]);
  });

  test("never mutates the input node and preserves identity when nothing to seed", () => {
    const measured = folder({ measured: { width: 1, height: 1 } });
    const input = [measured];
    const out = seedRfInternals(input, opts());
    expect(out).toBe(input);
    expect(measured.handles).toBeUndefined();

    const raw = folder();
    seedRfInternals([raw], opts());
    expect(raw.measured).toBeUndefined();
    expect(raw.handles).toBeUndefined();
  });

  test("skips measured, already-seeded, non-card types, and collapsed folders", () => {
    expect(shouldSeedRfInternals(folder({ measured: { width: 1, height: 1 } }), opts())).toBe(false);
    expect(shouldSeedRfInternals(folder({ handles: [] }), opts())).toBe(false);
    expect(shouldSeedRfInternals(folder({ type: "groupPill" }), opts())).toBe(false);
    expect(shouldSeedRfInternals(folder(), opts("TB", ["f1"]))).toBe(false);
    expect(shouldSeedRfInternals(folder({ data: { label: "x", path: "x", type: "folder", depth: 0, collapsed: true } as never }), opts())).toBe(false);
    expect(shouldSeedRfInternals(folder(), opts())).toBe(true);
  });

  test("TB geometry: source Bottom, target Top — 8px handles centered on the card edges", () => {
    const [seeded] = seedRfInternals([folder()], opts("TB"));
    const source = seeded.handles!.find((h) => h.type === "source")!;
    const target = seeded.handles!.find((h) => h.type === "target")!;
    expect(source.position).toBe(Position.Bottom);
    expect(target.position).toBe(Position.Top);
    // bottom: center on bottom padding edge (h-1), half hangs out → y = h-1-4
    expect(source).toMatchObject({ x: 240 / 2 - 4, y: 200 - 1 - 4, width: 8, height: 8 });
    expect(source.id).toBe("source-bottom");
    // top: y = 1 - 4
    expect(target).toMatchObject({ x: 116, y: -3, width: 8, height: 8 });
    expect(target.id).toBe("target-top");
  });

  test("LR geometry: source Right, target Left", () => {
    const [seeded] = seedRfInternals([folder()], opts("LR"));
    const source = seeded.handles!.find((h) => h.type === "source")!;
    const target = seeded.handles!.find((h) => h.type === "target")!;
    expect(source.position).toBe(Position.Right);
    expect(source).toMatchObject({ x: 240 - 1 - 4, y: 96, width: 8, height: 8 });
    expect(target.position).toBe(Position.Left);
    expect(target).toMatchObject({ x: -3, y: 96, width: 8, height: 8 });
  });

  test("only changes the array when at least one node was seeded", () => {
    const a = folder({ id: "a" });
    const b = folder({ id: "b", measured: { width: 2, height: 2 } });
    const out = seedRfInternals([a, b], opts());
    expect(out).not.toBe([a, b]);
    expect(out[1]).toBe(b);
    expect(out[0]).not.toBe(a);
  });

  test("cache: re-seeding returns the same object; direction switch re-seeds", () => {
    const node = folder();
    const [first] = seedRfInternals([node], opts("TB"));
    const [again] = seedRfInternals([node], opts("TB"));
    expect(again).toBe(first);
    const [lr] = seedRfInternals([node], opts("LR"));
    expect(lr).not.toBe(first);
    expect(lr.handles!.find((h) => h.type === "source")!.position).toBe(Position.Right);
  });
});
