import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { folderName, forgetFolder, mergeRecentFolder, recentFolders, rememberFolder } from "./recentFolders";

// Bun's test runner has no localStorage — install a minimal in-memory one for
// the storage-backed tests and restore the process afterwards (AGENTS.md →
// test isolation: the bun registry is process-wide).
const g = globalThis as { localStorage?: Storage };
const hadStorage = "localStorage" in g;
const originalStorage = g.localStorage;
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as unknown as Storage;
}
beforeEach(() => {
  g.localStorage = fakeStorage();
});
afterEach(() => {
  if (hadStorage) g.localStorage = originalStorage;
  else delete g.localStorage;
});

describe("folderName", () => {
  test("posix and windows separators", () => {
    expect(folderName("/home/u/projects/app")).toBe("app");
    expect(folderName("C:\\Users\\u\\Docs")).toBe("Docs");
  });

  test("path without separators returns itself", () => {
    expect(folderName("app")).toBe("app");
  });
});

describe("mergeRecentFolder", () => {
  const f = (path: string) => ({ path, name: folderName(path) });

  test("puts the newest folder first", () => {
    expect(mergeRecentFolder(f("/b"), [f("/a")])).toEqual([f("/b"), f("/a")]);
  });

  test("de-duplicates by path, keeping the newest position", () => {
    expect(mergeRecentFolder(f("/a"), [f("/a"), f("/b")])).toEqual([f("/a"), f("/b")]);
  });

  test("caps the list at the given max", () => {
    const full = Array.from({ length: 10 }, (_, i) => f(`/f${i}`));
    const next = mergeRecentFolder(f("/new"), full, 10);
    expect(next).toHaveLength(10);
    expect(next[0]).toEqual(f("/new"));
    expect(next).not.toContainEqual(f("/f9"));
  });

  test("ignores an empty path", () => {
    expect(mergeRecentFolder(f(""), [f("/a")])).toEqual([f("/a")]);
  });
});

describe("storage-backed list", () => {
  test("reads an empty list when the key is absent", () => {
    expect(recentFolders()).toEqual([]);
  });

  test("rememberFolder records the folder; forgetFolder removes it", () => {
    const after = rememberFolder("/home/u/app");
    expect(after[0]?.path).toBe("/home/u/app");
    expect(recentFolders()[0]?.path).toBe("/home/u/app");
    forgetFolder("/home/u/app");
    expect(recentFolders().some((f) => f.path === "/home/u/app")).toBe(false);
  });
});