import { describe, expect, test } from "bun:test";
import type { FewerNode } from "./types";
import { compareSiblings } from "./sorting";

function mk(
  label: string,
  type: "folder" | "file" = "file",
  opts: { size?: number; extension?: string } = {},
): FewerNode {
  return {
    id: label,
    type: type,
    position: { x: 0, y: 0 },
    data: {
      label,
      type,
      size: opts.size ?? 0,
      depth: 0,
      isRoot: false,
      extension: opts.extension,
    },
  } as FewerNode;
}

describe("compareSiblings — name", () => {
  test("ascending orders alphabetically", () => {
    const a = mk("b");
    const b = mk("a");
    expect(compareSiblings(a, b, "name", "asc")).toBeGreaterThan(0);
    expect(compareSiblings(b, a, "name", "asc")).toBeLessThan(0);
  });

  test("descending inverts the primary key", () => {
    const a = mk("a");
    const b = mk("b");
    expect(compareSiblings(a, b, "name", "desc")).toBeGreaterThan(0);
  });

  test("identical labels fall back to a stable tie-break (0)", () => {
    const a = mk("x");
    const b = mk("x");
    expect(compareSiblings(a, b, "name", "asc")).toBe(0);
  });
});

describe("compareSiblings — size", () => {
  test("ascending puts smaller sizes first", () => {
    const small = mk("a", "file", { size: 10 });
    const big = mk("b", "file", { size: 100 });
    expect(compareSiblings(small, big, "size", "asc")).toBeLessThan(0);
    expect(compareSiblings(big, small, "size", "asc")).toBeGreaterThan(0);
  });

  test("unknown size (0) sorts last in ascending and last in descending", () => {
    const known = mk("a", "file", { size: 10 });
    const unknown = mk("b", "file", { size: 0 });
    // ascending: known first
    expect(compareSiblings(known, unknown, "size", "asc")).toBeLessThan(0);
    // descending: known first (largest), unknown still trails
    expect(compareSiblings(known, unknown, "size", "desc")).toBeLessThan(0);
    expect(compareSiblings(unknown, known, "size", "desc")).toBeGreaterThan(0);
  });
});

describe("compareSiblings — type", () => {
  test("folders always sort before files regardless of direction", () => {
    const folder = mk("z", "folder");
    const file = mk("a", "file", { extension: "ts" });
    expect(compareSiblings(folder, file, "type", "asc")).toBeLessThan(0);
    expect(compareSiblings(folder, file, "type", "desc")).toBeLessThan(0);
  });

  test("files group by extension alphabetically (asc), inverted in desc", () => {
    const ts = mk("a", "file", { extension: "ts" });
    const css = mk("b", "file", { extension: "css" });
    // css < ts
    expect(compareSiblings(css, ts, "type", "asc")).toBeLessThan(0);
    // desc inverts extension order
    expect(compareSiblings(css, ts, "type", "desc")).toBeGreaterThan(0);
  });

  test("ties within the same extension fall back to name tie-break", () => {
    const a = mk("z", "file", { extension: "ts" });
    const b = mk("a", "file", { extension: "ts" });
    expect(compareSiblings(a, b, "type", "asc")).toBeGreaterThan(0);
    expect(compareSiblings(b, a, "type", "asc")).toBeLessThan(0);
  });
});
