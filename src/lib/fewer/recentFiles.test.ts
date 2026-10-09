import { describe, expect, test } from "bun:test";
import { forgetRecent, mergeRecent, recentFiles } from "./recentFiles";

describe("mergeRecent", () => {
  test("puts the newest path first", () => {
    expect(mergeRecent("/b.fwr", ["/a.fwr"])).toEqual(["/b.fwr", "/a.fwr"]);
  });

  test("de-duplicates, keeping the newest position", () => {
    expect(mergeRecent("/a.fwr", ["/a.fwr", "/b.fwr"])).toEqual(["/a.fwr", "/b.fwr"]);
  });

  test("caps the list at the max", () => {
    const full = Array.from({ length: 10 }, (_, i) => `/f${i}.fwr`);
    const next = mergeRecent("/new.fwr", full);
    expect(next).toHaveLength(10);
    expect(next[0]).toBe("/new.fwr");
    expect(next).not.toContain("/f9.fwr");
  });

  test("ignores an empty path", () => {
    expect(mergeRecent("", ["/a.fwr"])).toEqual(["/a.fwr"]);
  });
});

describe("storage-backed list", () => {
  test("reads an empty list when no storage or key exists", () => {
    expect(recentFiles()).toEqual([]);
  });

  test("forgetRecent on an empty list stays empty (no throw)", () => {
    expect(forgetRecent("/gone.fwr")).toEqual([]);
  });
});
