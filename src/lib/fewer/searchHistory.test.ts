import { test, expect } from "bun:test";
import { withSearchEntry, MAX_SEARCH_HISTORY } from "./searchHistory";

test("withSearchEntry prepends a new term", () => {
  expect(withSearchEntry([], "foo")).toEqual(["foo"]);
  expect(withSearchEntry(["foo"], "bar")).toEqual(["bar", "foo"]);
});

test("withSearchEntry moves an existing duplicate to the front", () => {
  expect(withSearchEntry(["foo", "bar", "baz"], "bar")).toEqual(["bar", "foo", "baz"]);
});

test("withSearchEntry ignores blank queries", () => {
  expect(withSearchEntry(["foo"], "")).toEqual(["foo"]);
  expect(withSearchEntry(["foo"], "   ")).toEqual(["foo"]);
  expect(withSearchEntry([], "  ")).toEqual([]);
});

test("withSearchEntry trims surrounding whitespace", () => {
  expect(withSearchEntry([], "  hello  ")).toEqual(["hello"]);
});

test("withSearchEntry caps at MAX_SEARCH_HISTORY and evicts the oldest", () => {
  const full = Array.from({ length: MAX_SEARCH_HISTORY }, (_, i) => `term${i}`);
  const result = withSearchEntry(full, "new");
  expect(result).toHaveLength(MAX_SEARCH_HISTORY);
  expect(result[0]).toBe("new");
  // Newest-first list: adding one evicts the tail (oldest = last element).
  expect(result).not.toContain("term11");
  expect(result[1]).toBe("term0");
});
