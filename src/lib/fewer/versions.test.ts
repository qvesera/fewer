import { test, expect } from "bun:test";
import { graphDataEqual, retentionCutoffIso } from "./versions";

test("graphDataEqual ignores object key order (jsonb normalizes it)", () => {
  const a = { nodes: [{ id: "n1", data: { label: "x" } }], direction: "TB", showFiles: true };
  const b = { showFiles: true, direction: "TB", nodes: [{ data: { label: "x" }, id: "n1" }] };
  expect(graphDataEqual(a, b)).toBe(true);
});

test("graphDataEqual distinguishes different values", () => {
  expect(graphDataEqual({ a: 1 }, { a: 2 })).toBe(false);
  expect(graphDataEqual(null, { a: 1 })).toBe(false);
  expect(graphDataEqual(undefined, undefined)).toBe(true);
});

test("graphDataEqual array order matters (node order is significant)", () => {
  const a = [{ id: "a" }, { id: "b" }];
  const b = [{ id: "b" }, { id: "a" }];
  expect(graphDataEqual(a, b)).toBe(false);
  expect(graphDataEqual(a, [...a])).toBe(true);
});

test("graphDataEqual catches missing/extra keys", () => {
  expect(graphDataEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  expect(graphDataEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
});
test("retentionCutoffIso lands exactly `days` in the past", () => {
  const cutoff = new Date(retentionCutoffIso(30)).getTime();
  const now = Date.now();
  // Allow a couple seconds of slack for the two Date.now() calls.
  expect(now - cutoff).toBeGreaterThanOrEqual(30 * 86_400_000 - 5_000);
  expect(now - cutoff).toBeLessThan(30 * 86_400_000 + 5_000);
});
