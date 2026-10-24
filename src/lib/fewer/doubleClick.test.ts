import { describe, expect, test } from "bun:test";
import { doubleClickIntent } from "./doubleClick";

// T-214: a file viewer must open files. Pure intent table — the hook only
// wires the three outcomes.

const file = (over: Record<string, unknown> = {}) => ({
  data: { type: "file", path: "app/src/a.ts", ...over },
});
const folder = { data: { type: "folder", path: "app/src" } };
const base = { host: true, dataSource: "directory", altKey: false, previewLicensed: false };

describe("doubleClickIntent", () => {
  test("desktop file → OS default app", () => {
    expect(doubleClickIntent(file(), base)).toBe("open");
  });

  test("folder → zoom (any host)", () => {
    expect(doubleClickIntent(folder, base)).toBe("zoom");
    expect(doubleClickIntent(folder, { ...base, host: false })).toBe("zoom");
  });

  test("non-disk sources keep zoom (sample, saved, cloud)", () => {
    expect(doubleClickIntent(file(), { ...base, dataSource: "sample" })).toBe("zoom");
    expect(doubleClickIntent(file(), { ...base, dataSource: null })).toBe("zoom");
  });

  test("web build keeps zoom (no native opener)", () => {
    expect(doubleClickIntent(file(), { ...base, host: false })).toBe("zoom");
  });

  test("expanded-archive members zoom — their path is not a real file", () => {
    expect(doubleClickIntent(file({ isArchive: true }), base)).toBe("zoom");
  });

  test("Alt+double-click keeps the licensed in-app preview", () => {
    expect(doubleClickIntent(file(), { ...base, altKey: true, previewLicensed: true })).toBe("preview");
    // Unlicensed (the shipped shell is free): Alt does not unlock anything.
    expect(doubleClickIntent(file(), { ...base, altKey: true, previewLicensed: false })).toBe("open");
  });
});