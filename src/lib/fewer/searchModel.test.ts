import { describe, expect, it } from "bun:test";
import type { FewerNode, FewerNodeData } from "./types";
import {
  SEARCH_RESULT_LIMIT,
  compareSearchResults,
  labelMatchRank,
  matchesCategoryFilter,
  matchesQuery,
  nextActiveIndex,
  searchKeyAction,
  searchNodes,
  searchPanelView,
  visibleMatches,
} from "./searchModel";

// The search panel's pure decisions: match ranking, result ordering, the filter
// predicates, the 50-result cap, the keyboard decision table and view choice.

/** Minimal node fixture: label/path default to the id, files at the root. */
function node(id: string, data: Partial<FewerNodeData> = {}): FewerNode {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { label: id, path: id, type: "file", ...data },
  } as FewerNode;
}

describe("labelMatchRank", () => {
  it("orders exact before prefix before fuzzy before the catch-all", () => {
    expect(labelMatchRank("readme", "readme")).toBe(0);
    expect(labelMatchRank("readme.md", "read")).toBe(1);
    expect(labelMatchRank("src/readme.md", "readme")).toBe(2);
    expect(labelMatchRank("index.ts", "zzz")).toBe(3);
  });

  it("compares case-insensitively", () => {
    expect(labelMatchRank("README", "readme")).toBe(0);
    expect(labelMatchRank("ReadMe.md", "read")).toBe(1);
  });
});

describe("compareSearchResults", () => {
  it("a better label match wins regardless of type", () => {
    const exactFile = node("a", { label: "readme" });
    const prefixFolder = node("b", { label: "readme-src", type: "folder" });
    expect(compareSearchResults(exactFile, prefixFolder, "readme")).toBeLessThan(0);
    expect(compareSearchResults(prefixFolder, exactFile, "readme")).toBeGreaterThan(0);
  });

  it("on equal rank, files come before folders", () => {
    const file = node("a", { label: "zzz.ts" });
    const folder = node("b", { label: "zzz", type: "folder" });
    expect(compareSearchResults(file, folder, "zzzz")).toBeLessThan(0);
    expect(compareSearchResults(folder, file, "zzzz")).toBeGreaterThan(0);
  });

  it("on equal rank and type, sorts alphabetically", () => {
    const a = node("a", { label: "alpha-zzz" });
    const b = node("b", { label: "beta-zzz" });
    expect(compareSearchResults(a, b, "zzzz")).toBeLessThan(0);
    expect(compareSearchResults(b, a, "zzzz")).toBeGreaterThan(0);
  });
});

describe("matchesCategoryFilter", () => {
  it("an empty filter keeps everything", () => {
    expect(matchesCategoryFilter(node("a", { category: "code" as never }), [])).toBe(true);
    expect(matchesCategoryFilter(node("a", { type: "folder" }), [])).toBe(true);
  });

  it("a folder always passes so its files stay reachable", () => {
    expect(matchesCategoryFilter(node("f", { type: "folder" }), ["code"])).toBe(true);
  });

  it("a file passes only when its category is listed", () => {
    expect(matchesCategoryFilter(node("a", { category: "code" as never }), ["code"])).toBe(true);
    expect(matchesCategoryFilter(node("a", { category: "image" as never }), ["code"])).toBe(false);
  });
});

describe("matchesQuery", () => {
  it("an empty query matches everything", () => {
    expect(matchesQuery(node("a"), "")).toBe(true);
  });

  it("matches the label, the path or the extension", () => {
    expect(matchesQuery(node("a", { label: "readme.md" }), "rdm")).toBe(true);
    expect(matchesQuery(node("a", { label: "x.ts", path: "src/deep/abc.ts" }), "deep")).toBe(true);
    expect(matchesQuery(node("a", { extension: "tsx" }), "tsx")).toBe(true);
  });

  it("rejects a query found in none of the three", () => {
    expect(matchesQuery(node("a", { label: "index.ts", path: "index.ts", extension: "ts" }), "zzz")).toBe(false);
  });
});

describe("searchNodes", () => {
  const nodes = [
    node("src", { label: "src", type: "folder", path: "src" }),
    node("main", { label: "main.ts", path: "src/main.ts", category: "code" as never }),
    node("logo", { label: "logo.png", path: "assets/logo.png", category: "image" as never }),
  ];

  it("applies the query and the category filter together", () => {
    expect(searchNodes(nodes, "main", ["code"]).map((n) => n.id)).toEqual(["main"]);
    // An empty query makes every label a "prefix" match, so ordering falls
    // through to files-before-folders: the image file sorts ahead of the folder.
    expect(searchNodes(nodes, "", ["image"]).map((n) => n.id)).toEqual(["logo", "src"]);
  });

  it("orders the survivors best-match first", () => {
    const list = [node("b", { label: "src/main.ts", path: "src/main.ts" }), node("a", { label: "main" })];
    expect(searchNodes(list, "main", []).map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("returns a new array without mutating the store's node list", () => {
    const before = nodes.map((n) => n.id);
    const out = searchNodes(nodes, "", []);
    expect(out).not.toBe(nodes);
    expect(nodes.map((n) => n.id)).toEqual(before);
  });
});

describe("visibleMatches", () => {
  it("caps at the panel's render limit, keeping the first results", () => {
    const many = Array.from({ length: SEARCH_RESULT_LIMIT + 10 }, (_, i) => i);
    const visible = visibleMatches(many);
    expect(visible).toHaveLength(SEARCH_RESULT_LIMIT);
    expect(visible[0]).toBe(0);
    expect(visible[SEARCH_RESULT_LIMIT - 1]).toBe(SEARCH_RESULT_LIMIT - 1);
  });

  it("leaves a short list alone", () => {
    expect(visibleMatches([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe("nextActiveIndex", () => {
  it("walks down and clamps to the last result", () => {
    expect(nextActiveIndex(-1, 3, "down")).toBe(0);
    expect(nextActiveIndex(0, 3, "down")).toBe(1);
    expect(nextActiveIndex(2, 3, "down")).toBe(2);
  });

  it("with no results the down-clamp floor is 0, not -1 (pre-existing quirk)", () => {
    expect(nextActiveIndex(-1, 0, "down")).toBe(0);
    expect(nextActiveIndex(5, 0, "down")).toBe(0);
  });

  it("up never goes below zero", () => {
    expect(nextActiveIndex(3, 5, "up")).toBe(2);
    expect(nextActiveIndex(0, 5, "up")).toBe(0);
    expect(nextActiveIndex(-1, 5, "up")).toBe(0);
  });
});

describe("searchKeyAction", () => {
  const ctx = { activeIndex: -1, resultCount: 3, canCommit: false };

  it("Escape closes", () => {
    expect(searchKeyAction("Escape", ctx)).toEqual({ type: "close" });
  });

  it("the arrow keys move the active result", () => {
    expect(searchKeyAction("ArrowDown", ctx)).toEqual({ type: "move", next: 0 });
    expect(searchKeyAction("ArrowUp", { ...ctx, activeIndex: 2 })).toEqual({ type: "move", next: 1 });
  });

  it("Enter opens the active result, taking precedence over committing", () => {
    expect(searchKeyAction("Enter", { ...ctx, activeIndex: 1, canCommit: true })).toEqual({
      type: "open",
      index: 1,
    });
  });

  it("Enter commits only with no active result and a usable query", () => {
    expect(searchKeyAction("Enter", { ...ctx, canCommit: true })).toEqual({ type: "commit" });
    expect(searchKeyAction("Enter", { ...ctx, canCommit: false })).toEqual({ type: "none" });
  });

  it("ignores every other key", () => {
    expect(searchKeyAction("a", ctx)).toEqual({ type: "none" });
    expect(searchKeyAction("Tab", ctx)).toEqual({ type: "none" });
  });
});

describe("searchPanelView", () => {
  const base = { hasQuery: false, categoryFilterCount: 0, historyCount: 0, matchCount: 0 };

  it("with nothing to search for: recent searches, else the start prompt", () => {
    expect(searchPanelView({ ...base, historyCount: 2 })).toBe("history");
    expect(searchPanelView(base)).toBe("prompt");
  });

  it("a query or an active category filter switches to results", () => {
    expect(searchPanelView({ ...base, hasQuery: true, matchCount: 2 })).toBe("results");
    expect(searchPanelView({ ...base, categoryFilterCount: 1, matchCount: 2 })).toBe("results");
  });

  it("no matches says so instead of showing a stale history", () => {
    expect(searchPanelView({ ...base, hasQuery: true, historyCount: 3 })).toBe("empty");
    expect(searchPanelView({ ...base, categoryFilterCount: 1, matchCount: 0 })).toBe("empty");
  });
});
