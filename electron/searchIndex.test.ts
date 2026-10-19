// Pure parts of the on-device search index (T-200). Bun has no node:sqlite,
// so the database-backed paths are exercised by the Electron smoke test
// (e2e/electron.spec.ts → index_build / index_search); the skip list, query
// sanitising and path joining are pinned here without a database.
import { describe, expect, test } from "bun:test";
import {
  ROOT_ROW_CAP,
  SKIP_DIRS,
  TOTAL_ROW_CAP,
  joinPath,
  likePattern,
  likePrefixPattern,
  resolveDbPath,
  sanitizeFtsQuery,
  shouldSkipDir,
} from "./searchIndex";

describe("shouldSkipDir", () => {
  test("skip list and hidden dirs never descend", () => {
    expect(shouldSkipDir("node_modules")).toBe(true);
    expect(shouldSkipDir(".git")).toBe(true);
    expect(shouldSkipDir(".cache")).toBe(true);
    expect(shouldSkipDir("src")).toBe(false);
    expect(shouldSkipDir("My Project")).toBe(false);
  });

  test("every skip-list entry is skipped (and the set is non-trivial)", () => {
    expect(SKIP_DIRS.size).toBeGreaterThan(5);
    for (const name of SKIP_DIRS) expect(shouldSkipDir(name)).toBe(true);
  });
});

describe("sanitizeFtsQuery", () => {
  test("prefix-matches each token, AND-ed", () => {
    expect(sanitizeFtsQuery("foo bar")).toBe(`"foo"* AND "bar"*`);
  });

  test("strips FTS syntax so a hostile query degrades to tokens", () => {
    expect(sanitizeFtsQuery(`foo(bar:*) "x" ^y`)).toBe(`"foo"* AND "bar"* AND "x"* AND "y"*`);
  });

  test("empty / whitespace query yields no FTS expression", () => {
    expect(sanitizeFtsQuery("   ")).toBe("");
  });

  test("caps the token count", () => {
    const q = Array.from({ length: 20 }, (_, i) => `t${i}`).join(" ");
    expect(sanitizeFtsQuery(q).split(" AND ")).toHaveLength(8);
  });
});

describe("LIKE patterns", () => {
  test("escapes %, _ and backslash", () => {
    expect(likePattern("100%_done")).toBe(`%100\\%\\_done%`);
    expect(likePrefixPattern("a\\b")).toBe("a\\\\b%");
  });
});

describe("joinPath", () => {
  test("posix join", () => {
    expect(joinPath("/home/u/app", "src")).toBe("/home/u/app/src");
    expect(joinPath("/home/u/app/", "src")).toBe("/home/u/app/src");
  });

  test("windows drive letters and backslashes survive", () => {
    expect(joinPath("C:\\Users\\u", "app")).toBe("C:\\Users\\u\\app");
    expect(joinPath("C:\\Users\\u\\", "app")).toBe("C:\\Users\\u\\app");
  });
});

describe("caps and paths", () => {
  test("caps are the documented bounds", () => {
    expect(ROOT_ROW_CAP).toBe(250_000);
    expect(TOTAL_ROW_CAP).toBe(500_000);
  });

  test("the database lives under userData, never the library", () => {
    expect(resolveDbPath("/home/u/.config/Fewer")).toBe("/home/u/.config/Fewer/search-index.db");
  });
});